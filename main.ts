import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, ItemView, WorkspaceLeaf, MarkdownRenderer, ButtonComponent, TextComponent } from 'obsidian';

interface EbbinghausPluginSettings {
    reviewIntervals: number[];
    reviewHeaders: string[];
}

const DEFAULT_SETTINGS: EbbinghausPluginSettings = {
    reviewIntervals: [1, 2, 4, 7, 15, 30, 90, 180],
    reviewHeaders: ["1天", "2天", "4天", "7天", "15天", "1月", "3月", "6月"]
}

export default class EbbinghausPlugin extends Plugin {
    settings: EbbinghausPluginSettings;
    private view: EbbinghausView;

    async onload() {
        await this.loadSettings();

        this.addRibbonIcon("brain", "Ebbinghaus Review", () => {
            this.activateView();
        });

        this.addCommand({
            id: 'create-ebbinghaus-note',
            name: '创建艾宾浩斯笔记',
            callback: () => {
                this.createEbbinghausNote();
            }
        });

        this.registerView(
            "ebbinghaus-view",
            (leaf) => {
                const view = new EbbinghausView(leaf, this);
                this.view = view;
                return view;
            }
        );

        this.addSettingTab(new EbbinghausSettingTab(this.app, this));
    }

    onunload() {
        this.app.workspace.detachLeavesOfType("ebbinghaus-view");
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async createEbbinghausNote() {
        const fileName = `Ebbinghaus-${new Date().toISOString().split('T')[0]}.md`;
        const content = this.getEbbinghausNoteTemplate();
        const file = await this.app.vault.create(fileName, content);
        await this.app.workspace.activeLeaf?.openFile(file);
    }

    getEbbinghausNoteTemplate() {
        return `---
created: ${new Date().toISOString()}
tags: ebbinghaus
---

# 艾宾浩斯笔记

## 内容

[在这里记录你要记忆的内容]

## 复习计划

${this.settings.reviewIntervals.map((interval, index) => 
    `- [ ] 第${index + 1}次复习：${new Date(Date.now() + interval * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}`
).join('\n')}
`;
    }

    async activateView() {
        const { workspace } = this.app;

        let leaf = this.app.workspace.getLeavesOfType("ebbinghaus-view")[0];
        if (!leaf) {
            const rightLeaf = this.app.workspace.getRightLeaf(false);
            if (rightLeaf) {
                leaf = rightLeaf;
            } else {
                leaf = this.app.workspace.getLeaf(true);
            }
            await leaf.setViewState({ type: "ebbinghaus-view", active: true });
        }

        this.app.workspace.revealLeaf(leaf);
    }
}

class EbbinghausSettingTab extends PluginSettingTab {
    plugin: EbbinghausPlugin;

    constructor(app: App, plugin: EbbinghausPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const {containerEl} = this;

        containerEl.empty();

        containerEl.createEl('h2', {text: '艾宾浩斯记忆法设置'});

        new Setting(containerEl)
            .setName('复习间隔（天）')
            .setDesc('设置复习的间隔天数，用逗号分隔')
            .addText(text => text
                .setPlaceholder('1,2,4,7,15,30,90,180')
                .setValue(this.plugin.settings.reviewIntervals.join(','))
                .onChange(async (value) => {
                    this.plugin.settings.reviewIntervals = value.split(',').map(Number);
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('复习栏表头')
            .setDesc('设置复习栏的表头文字，用逗号分隔')
            .addText(text => text
                .setPlaceholder('1天,2天,4天,7天,15天,1月,3月,6月')
                .setValue(this.plugin.settings.reviewHeaders.join(','))
                .onChange(async (value) => {
                    this.plugin.settings.reviewHeaders = value.split(',');
                    await this.plugin.saveSettings();
                }));
    }
}

class EbbinghausView extends ItemView {
    private plugin: EbbinghausPlugin;

    constructor(leaf: WorkspaceLeaf, plugin: EbbinghausPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType() {
        return "ebbinghaus-view";
    }

    getDisplayText() {
        return "艾宾浩斯复习计划";
    }

    async onOpen() {
        const container = this.containerEl.children[1];
        container.empty();
        container.addClass('ebbinghaus-container');

        container.createEl("h4", { text: "艾宾浩斯复习计划" });

        const reviewPlanContainer = container.createEl("div", { cls: "review-plan-container" });
        await this.createReviewPlan(reviewPlanContainer);

        const buttonRow = container.createEl("div", { cls: "ebbinghaus-row" });
        new ButtonComponent(buttonRow)
            .setButtonText("生成复习计划")
            .onClick(() => {
                this.generateReviewPlan();
            });

        this.addStyle();
        this.addResizeObserver();

        // 初始检查宽度并应用布局
        const width = this.containerEl.offsetWidth;
        if (width <= 359) {
            this.containerEl.classList.add('compact-view');
        } else {
            this.containerEl.classList.remove('compact-view');
        }
    }

    async createReviewPlan(container: HTMLElement) {
        const reviewHeaders = this.plugin.settings.reviewHeaders;
        const headers = ["#", "日期", "学习内容", ...reviewHeaders];
        
        const headerRow = container.createEl("div", { cls: "review-row header" });
        headers.forEach((header, index) => {
            headerRow.createEl("div", { text: header, cls: `review-cell ${index > 2 ? 'review-date' : ''}` });
        });

        const learningContent = await this.getLearningContent();

        // 创建表格主体容器
        const tableBody = container.createEl("div", { cls: "table-body" });

        // 创建初始的5行
        for (let i = 1; i <= 5; i++) {
            this.createRow(tableBody, i, learningContent);
        }

        // 修改添加行按钮的创建方式
        const addRowButton = container.createEl("div", { 
            cls: "add-row-button review-row"
        });
        
        // 创建一个跨越整行的单元格
        const fullRowCell = addRowButton.createEl("div", {
            cls: "review-cell full-row",
            text: "添加行"
        });
        
        addRowButton.addEventListener("click", () => {
            const currentRows = tableBody.querySelectorAll(".review-row").length;
            this.createRow(tableBody, currentRows + 1, learningContent);
        });
    }

    // 新增创建单行的方法
    private createRow(container: HTMLElement, rowNumber: number, learningContent: string) {
        const row = container.createEl("div", { cls: "review-row" });
        const today = new Date();
        const rowDate = new Date(today.setDate(today.getDate() + (rowNumber - 1)));
        
        const reviewHeaders = this.plugin.settings.reviewHeaders;
        const headers = ["#", "日期", "学习内容", ...reviewHeaders];

        const getReviewNumber = (rowNum: number, colIndex: number): string => {
            const reviewMatrix: { [key: number]: { [key: number]: number } } = {};
            
            // 动态生成复习矩阵
            for (let i = 1; i <= 23; i++) {
                reviewMatrix[i] = {};
                for (let j = 3; j < headers.length; j++) {
                    const value = this.calculateReviewNumber(i, j - 3);
                    reviewMatrix[i][j] = value;
                }
            }

            if (reviewMatrix[rowNum] && reviewMatrix[rowNum][colIndex] !== undefined) {
                const num = reviewMatrix[rowNum][colIndex];
                return num === 0 ? '-' : num.toString();
            }
            return '';
        };

        headers.forEach((header, index) => {
            const cell = row.createEl("div", { cls: `review-cell ${index > 2 ? 'review-date' : ''}` });
            if (index === 0) {
                cell.setText(rowNumber.toString());
            } else if (index === 1) {
                cell.createEl("input", {
                    type: "date",
                    cls: "date-input",
                    value: rowDate.toISOString().split("T")[0]
                });
            } else if (index === 2) {
                const contentCell = cell.createEl("div", { cls: "content-cell" });
                this.renderMarkdown(contentCell, learningContent);
                this.addClickToOpenNote(contentCell, learningContent);
            } else {
                const reviewNumber = getReviewNumber(rowNumber, index);
                if (reviewNumber === '-') {
                    // 如果是 "-"，创建一个不可编辑的 div
                    cell.createEl("div", {
                        cls: "review-status disabled",
                        text: "-"
                    });
                } else {
                    // 如果不是 "-"，创建可编辑的输入框
                    const input = cell.createEl("input", {
                        type: "text",
                        cls: "review-status",
                        attr: { 
                            maxlength: "2",
                            placeholder: reviewNumber
                        }
                    });

                    input.addEventListener("focus", (e) => {
                        (e.target as HTMLInputElement).select();
                    });
                }
            }
        });
    }

    async getLearningContent(): Promise<string> {
        const file = this.app.vault.getAbstractFileByPath('enm1.md');
        if (file instanceof TFile) {
            const content = await this.app.vault.read(file);
            const lines = content.split('\n');
            let learningContent = '';
            let isLearningContent = false;

            for (const line of lines) {
                if (line.startsWith('# 学习内容')) {
                    isLearningContent = true;
                    continue;
                }
                if (isLearningContent && line.startsWith('#')) {
                    break;
                }
                if (isLearningContent) {
                    learningContent += line + '\n';
                }
            }

            return learningContent.trim();
        }
        return '未找到学习内容';
    }

    renderMarkdown(container: HTMLElement, content: string) {
        MarkdownRenderer.renderMarkdown(content, container, "", this);
    }

    generateReviewPlan() {
        // 生成复习计划的逻辑
    }

    addStyle() {
        const style = document.createElement('style');
        style.textContent = `
            .ebbinghaus-container {
                font-size: 12px;
                color: var(--text-normal);
                background-color: var(--background-primary);
                padding: 10px;
                overflow-x: hidden;
                width: 100%;
                height: 100%;
            }
            .review-plan-container {
                display: flex;
                flex-direction: column;
                border: 1px solid var(--background-modifier-border) !important;
                width: fit-content;
                background-color: var(--background-primary);
            }
            .review-row {
                display: flex;
                border-bottom: 1px solid var(--background-modifier-border) !important;
                flex-wrap: nowrap;
                background-color: var(--background-primary);
            }
            .review-cell {
                flex: 1;
                padding: 5px;
                border-right: 1px solid var(--background-modifier-border) !important;
                display: flex;
                align-items: center;
                justify-content: center;
                min-height: 28px;
                overflow: hidden;
                background-color: var(--background-primary);
            }
            .review-cell:nth-child(1) { 
                flex: 0 0 30px;
                min-width: 30px;
            }
            .review-cell:nth-child(2) { 
                flex: 0 0 130px;
                min-width: 130px;
            }
            .review-cell:nth-child(3) { 
                flex: 0 0 200px;
                min-width: 200px;
                max-width: 200px;
            }
            .review-cell:nth-child(n+4) { 
                flex: 0 0 42px;
                min-width: 42px;
            }

            .review-row.header {
                font-weight: bold;
                background-color: var(--background-secondary);
            }

            .date-input {
                width: 100%;
                text-align: center;
                background-color: transparent;
                border: none;
                color: var(--text-normal);
                outline: none;
            }

            .date-input:focus {
                background-color: var(--background-modifier-form-field);
            }

            .review-status {
                width: 100%;
                text-align: center;
                background-color: transparent !important;
                border: none !important;
                color: var(--text-normal);
                outline: none;
                -webkit-appearance: none;
                -moz-appearance: none;
                appearance: none;
                padding: 0;
                margin: 0;
            }

            .review-status:focus {
                background-color: transparent !important;
            }

            .content-cell {
                width: 100%;
                height: 100%;
                overflow-y: auto;
                max-height: 100px;
                text-align: left;
            }
            .content-cell p {
                margin: 0;
                text-align: left;
            }
            .content-cell ul, .content-cell ol {
                margin: 0;
                padding-left: 20px;
            }

            .compact-view .review-cell:nth-child(3) {
                flex: 1 !important;
            }

            .width-display {
                position: fixed;
                bottom: 10px;
                right: 10px;
                background-color: var(--background-secondary);
                color: var(--text-normal);
                padding: 5px 10px;
                border-radius: 5px;
                font-size: 12px;
                z-index: 1000;
            }

            .add-row-button {
                margin-top: -1px;
                background-color: var(--interactive-accent);
                color: var(--text-on-accent);
                cursor: pointer;
                height: 32px;
                transition: background-color 0.2s ease;
                border-bottom-left-radius: 4px;
                border-bottom-right-radius: 4px;
                border-top: 1px solid var(--background-modifier-border) !important;
            }

            .add-row-button:hover {
                background-color: var(--interactive-accent-hover);
            }

            .add-row-button .full-row {
                flex: 1;
                border: none !important;
                font-size: 14px;
                line-height: 32px;
                text-align: center;
                justify-content: center;
            }

            .review-status.disabled {
                color: var(--text-muted);
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: not-allowed;
                user-select: none;
                font-size: 14px;
            }
        `;
        document.head.appendChild(style);
    }

    addResizeObserver() {
        const resizeObserver = new ResizeObserver(entries => {
            for (let entry of entries) {
                const width = Math.round(entry.contentRect.width);
                
                // 基础宽度（序号、日期、内容列的总宽度）
                const baseWidth = 30 + 130 + 200; // 360px
                // 每个复习日期栏的宽度
                const reviewColumnWidth = 42;
                
                // 获取所有复习日期单元格（按列分组）
                const reviewDateColumns = [];
                for (let i = 0; i < 8; i++) { // 8个复习日期列
                    const column = this.containerEl.querySelectorAll(`.review-cell:nth-child(${i + 4})`);
                    reviewDateColumns.push(column);
                }
                
                // 计算可以显示的复习日期列数
                const availableWidth = width - baseWidth;
                const visibleColumns = Math.floor(availableWidth / reviewColumnWidth);
                
                // 从后往前依次显示或隐藏列
                reviewDateColumns.forEach((column, index) => {
                    const shouldShow = index < visibleColumns;
                    column.forEach(cell => {
                        (cell as HTMLElement).style.display = shouldShow ? '' : 'none';
                    });
                });
                
                // 调整容器宽度
                const reviewPlanContainer = this.containerEl.querySelector('.review-plan-container');
                if (reviewPlanContainer) {
                    const totalWidth = baseWidth + (Math.max(0, visibleColumns) * reviewColumnWidth);
                    (reviewPlanContainer as HTMLElement).style.width = `${totalWidth}px`;
                }
            }
        });

        resizeObserver.observe(this.containerEl);
    }

    private addClickToOpenNote(cell: HTMLElement, content: string) {
        cell.addEventListener("click", async (e) => {
            const target = e.target as HTMLElement;
            const closestLink = target.closest('a.internal-link');
            if (closestLink) {
                e.preventDefault();
                const href = closestLink.getAttribute('href');
                if (href) {
                    const file = this.app.metadataCache.getFirstLinkpathDest(href, "");
                    if (file) {
                        await this.app.workspace.getLeaf().openFile(file);
                    } else {
                        new Notice(`未找到笔记: ${href}`);
                    }
                }
            }
        });
    }

    // 新增计算复习序号的方法
    private calculateReviewNumber(rowNum: number, colIndex: number): number {
        // 第一行全部显示 '-'
        if (rowNum === 1) {
            return 0;  // 返回0表示显示'-'
        }

        // 对于其他行，如果列索引小于等于行号-2，则显示行号-1
        // 否则显示 '-'
        if (colIndex <= rowNum - 2) {
            return rowNum - 1;
        }
        
        return 0;  // 显示 '-'
    }
}
