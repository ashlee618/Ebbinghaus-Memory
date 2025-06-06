import { App, ItemView, MarkdownRenderer, Notice, Plugin, PluginSettingTab, Setting, TFile, WorkspaceLeaf } from 'obsidian';

interface EbbinghausPluginSettings {
    reviewIntervals: number[];
    reviewHeaders: string[];
    dataDirectory: string;
}

const DEFAULT_SETTINGS: EbbinghausPluginSettings = {
    reviewIntervals: [0, 1, 2, 4, 7, 15, 30, 60, 180],
    reviewHeaders: ["当天", "1天", "2天", "4天", "7天", "15天", "1月", "2月", "6月"],
    dataDirectory: "ebbinghaus"
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

## 学习计划

${this.settings.reviewIntervals.map((interval, index) => 
    `- [ ] 第${index + 1}次学习：${new Date(Date.now() + interval * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}`
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
            .setName('数据目录')
            .setDesc('设置存放学习计划的目录')
            .addText(text => text
                .setPlaceholder('ebbinghaus')
                .setValue(this.plugin.settings.dataDirectory)
                .onChange(async (value) => {
                    this.plugin.settings.dataDirectory = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('学习间隔（天）')
            .setDesc('设置学习的间隔天数，用逗号分隔')
            .addText(text => text
                .setPlaceholder('1,2,4,7,15,30,90,180')
                .setValue(this.plugin.settings.reviewIntervals.join(','))
                .onChange(async (value) => {
                    this.plugin.settings.reviewIntervals = value.split(',').map(Number);
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('学习栏表头')
            .setDesc('设置学习栏的表头文字，用逗号分隔')
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
    private reviewPlanFiles: TFile[] = [];
    private currentFile: TFile | null = null;
    private reviewData: { [key: string]: string | boolean } = {};
    private plugin: EbbinghausPlugin;

    constructor(leaf: WorkspaceLeaf, plugin: EbbinghausPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType() {
        return "ebbinghaus-view";
    }

    getDisplayText() {
        return "艾宾浩学习计划";
    }

    async onOpen() {
        const container = this.containerEl.children[1];
        container.empty();
        container.addClass('ebbinghaus-container');

        // 创建顶部控制区域
        const controlArea = container.createEl("div", { cls: "control-area" });
        
        // 添加新建按钮
        const newPlanButton = controlArea.createEl("button", {
            cls: "new-plan-button",
            text: "新建学习计划"
        });

        // 创建选择器容器
        const selectorContainer = controlArea.createEl("div", { cls: "selector-container" });
        
        // 添加文件选择下拉框
        const fileSelector = selectorContainer.createEl("select", { cls: "file-select" });
        
        // 添加跳转按钮
        const jumpButton = selectorContainer.createEl("button", {
            cls: "jump-button",
            text: "打开文件"
        });

        // 为新建按钮添加点击事件
        newPlanButton.addEventListener("click", () => {
            this.createNewReviewPlan();
        });

        // 为跳转按钮添加点击事件
        jumpButton.addEventListener("click", async () => {
            const selectedPath = fileSelector.value;
            if (selectedPath) {
                const file = this.app.vault.getAbstractFileByPath(selectedPath);
                if (file instanceof TFile) {
                    await this.app.workspace.getLeaf().openFile(file);
                }
            }
        });

        // 加载文件列表
        await this.loadReviewPlanFiles();
        
        // 创建下拉选项
        fileSelector.createEl("option", {
            text: "请选择学习计划",
            value: ""
        });

        this.reviewPlanFiles.forEach(file => {
            fileSelector.createEl("option", {
                text: file.basename,
                value: file.path
            });
        });

        // 添加选择事件
        fileSelector.addEventListener("change", async (e) => {
            const path = (e.target as HTMLSelectElement).value;
            if (path) {
                const file = this.app.vault.getAbstractFileByPath(path);
                if (file instanceof TFile) {
                    this.currentFile = file;
                    await this.loadReviewData();
                    await this.createReviewPlan(container);
                }
            }
        });

        this.addResizeObserver();

        // 初始检查宽度并应用布局
        const width = this.containerEl.offsetWidth;
        if (width <= 359) {
            this.containerEl.classList.add('compact-view');
        } else {
            this.containerEl.classList.remove('compact-view');
        }

        this.addStyle();
    }

    addStyle() {
        const style = document.createElement('style');
        style.textContent = `
            .control-area {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 8px;
                border-bottom: 1px solid var(--background-modifier-border);
            }

            .new-plan-button {
                white-space: nowrap;
                padding: 4px 12px;
                border-radius: 4px;
                border: 1px solid var(--background-modifier-border);
                background-color: var(--background-primary);
                color: var(--text-normal);
                cursor: pointer;
            }

            .new-plan-button:hover {
                background-color: var(--background-modifier-hover);
            }

            .selector-container {
                display: flex;
                align-items: center;
                gap: 8px;
                flex: 1;
            }

            .file-select {
                flex: 1;
                min-width: 0;
                padding: 4px 8px;
                border-radius: 4px;
                border: 1px solid var(--background-modifier-border);
                background-color: var(--background-primary);
                color: var(--text-normal);
            }

            .jump-button {
                white-space: nowrap;
                padding: 4px 12px;
                border-radius: 4px;
                border: 1px solid var(--background-modifier-border);
                background-color: var(--background-primary);
                color: var(--text-normal);
                cursor: pointer;
            }

            .jump-button:hover {
                background-color: var(--background-modifier-hover);
            }
        `;
        document.head.appendChild(style);
    }

    // 加载学习计划文件列表
    private async loadReviewPlanFiles() {
        const directory = this.plugin.settings.dataDirectory;
        const files = this.app.vault.getFiles();
        this.reviewPlanFiles = files.filter(file => 
            file.path.startsWith(directory) && file.extension === 'md'
        );
    }

    // 加载学习数据
    private async loadReviewData() {
        if (this.currentFile) {
            const content = await this.app.vault.read(this.currentFile);
            
            // 重置学习数据
            this.reviewData = {};
            
            // 处理学习内容部分
            const learningContentMatch = content.match(/# Learning Content\n([\s\S]*?)(?=\n#|$)/);
            if (learningContentMatch) {
                const learningContentSection = learningContentMatch[1];
                // 使用正则表达式匹配所有 "- 数字：|||内容|||" 格式的行
                const contentMatches = learningContentSection.matchAll(/- (\d+)：\|\|\|([\s\S]*?)\|\|\|/g);
                
                for (const match of contentMatches) {
                    const rowNum = match[1];
                    const content = match[2];
                    this.reviewData[`row${rowNum}_content`] = content;
                }
            }
            
            // 处理学习计划部分
            const dayPlannerMatch = content.match(/# Day planner\n([\s\S]*?)(?=\n#|$)/);
            if (dayPlannerMatch) {
                const dayPlannerSection = dayPlannerMatch[1];
                const statusMatches = dayPlannerSection.matchAll(/- (\d+)：(.+)/g);
                
                for (const match of statusMatches) {
                    const rowNum = match[1];
                    const statuses = match[2].split('');
                    
                    statuses.forEach((status, index) => {
                        const reviewId = `row${rowNum}_col${index + 3}`;
                        this.reviewData[reviewId] = status === '1';
                    });
                }
            }
        }
    }

    // 保存学习数据
    private async saveReviewData() {
        if (this.currentFile) {
            const content = await this.app.vault.read(this.currentFile);
            const lines = content.split('\n');
            
            // 准备学习内容数据
            const learningLines = ['# Learning Content'];
            // 准备学习状态数据
            const reviewLines = ['# Day planner'];
            
            // 获取所有行号
            const rowNumbers = [...new Set(
                Object.keys(this.reviewData)
                    .map(key => {
                        const match = key.match(/row(\d+)/);
                        return match ? parseInt(match[1]) : null;
                    })
                    .filter(num => num !== null)
            )].sort((a, b) => a - b);
            
            // 处理每一行的数据
            rowNumbers.forEach(rowNum => {
                // 处理学习内容
                const contentKey = `row${rowNum}_content`;
                if (contentKey in this.reviewData && this.reviewData[contentKey] !== undefined) {
                    // 获取内容并处理多行
                    const content = String(this.reviewData[contentKey]);
                    
                    // 使用 |||content||| 格式保存多行内容
                    learningLines.push(`- ${rowNum}：|||${content}|||`);
                }
                
                // 处理学习状态
                let statusString = '';
                for (let col = 3; col <= 10; col++) {
                    const reviewId = `row${rowNum}_col${col}`;
                    if (reviewId in this.reviewData) {
                        statusString += this.reviewData[reviewId] ? '1' : '0';
                    }
                }
                if (statusString.length > 0) {
                    reviewLines.push(`- ${rowNum}：${statusString}`);
                }
            });
            
            // 构建新的文件内容
            let newContent = content;
            
            // 更新或添加学习内容部分
            const learningStart = content.indexOf('# Learning Content');
            if (learningStart !== -1) {
                const nextHeading = content.slice(learningStart + 1).search(/\n#/);
                const learningEnd = nextHeading !== -1 
                    ? learningStart + nextHeading + 1 
                    : content.length;
                
                newContent = content.slice(0, learningStart) + 
                            learningLines.join('\n') + '\n\n' +
                            content.slice(learningEnd);
            } else {
                newContent = learningLines.join('\n') + '\n\n' + newContent;
            }
            
            // 更新或添加学习计划部分
            const plannerStart = newContent.indexOf('# Day planner');
            if (plannerStart !== -1) {
                const nextHeading = newContent.slice(plannerStart + 1).search(/\n#/);
                const plannerEnd = nextHeading !== -1 
                    ? plannerStart + nextHeading + 1 
                    : newContent.length;
                
                newContent = newContent.slice(0, plannerStart) + 
                            reviewLines.join('\n') + '\n\n' +
                            newContent.slice(plannerEnd);
            } else {
                newContent = newContent + '\n\n' + reviewLines.join('\n') + '\n';
            }
            
            await this.app.vault.modify(this.currentFile, newContent);
        }
    }

    async createReviewPlan(container: HTMLElement) {
        // 清空除了控制区域以外的所有内容
        const controlArea = container.querySelector('.control-area');
        container.empty();
        
        // 重新添加控制区域
        if (controlArea) {
            container.appendChild(controlArea);
        }

        // 创建表格内容
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

        // 添加行按钮
        const addRowButton = container.createEl("div", { 
            cls: "add-row-button review-row"
        });
        
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
            
            // 动态生成学习矩阵
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
                // 创建文本输入框
                const textarea = cell.createEl("textarea", {
                    cls: "content-input",
                    attr: {
                        placeholder: "输入学习内容"
                    }
                });
                
                // 如果有已保存的内容，显示出来
                const contentKey = `row${rowNumber}_content`;
                if (contentKey in this.reviewData && this.reviewData[contentKey] !== undefined) {
                    // 确保内容是字符串并正确显示
                    textarea.value = String(this.reviewData[contentKey]);
                    
                    // 调整文本框高度以适应内容
                    textarea.style.height = 'auto';
                    textarea.style.height = (textarea.scrollHeight) + 'px';
                }

                // 添加内容变化监听
                textarea.addEventListener("input", async () => {
                    this.reviewData[contentKey] = textarea.value;
                    
                    // 调整文本框高度
                    textarea.style.height = 'auto';
                    textarea.style.height = (textarea.scrollHeight) + 'px';
                    
                    await this.saveReviewData();
                });
            } else {
                const reviewNumber = getReviewNumber(rowNumber, index);
                if (reviewNumber === '-') {
                    cell.createEl("div", {
                        cls: "review-status disabled",
                        text: "-"
                    });
                } else {
                    const reviewCell = cell.createEl("div", {
                        cls: "review-status review-cell-clickable",
                        text: reviewNumber
                    });

                    // 生成唯一的学习记录 ID
                    const cellKey =`row${rowNumber}_col${index}`;
                    const reviewId = cellKey;
                    
                    // 根据保存的数据设置初始状态
                    if (this.reviewData[reviewId]) {
                        reviewCell.classList.add("review-completed");
                    }

                    reviewCell.addEventListener("click", async (e) => {
                        const target = e.target as HTMLElement;
                        target.classList.toggle("review-completed");
                        
                        // 更新并保存数据
                        this.reviewData[reviewId] = target.classList.contains("review-completed");
                        await this.saveReviewData();
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
                if (line.startsWith('# 习内容')) {
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
        // 生成学习计划的逻辑
    }

    addResizeObserver() {
        const resizeObserver = new ResizeObserver(entries => {
            for (let entry of entries) {
                const width = Math.round(entry.contentRect.width);
                
                // 基础宽度（序号、日期、内容列的总宽度）
                const baseWidth = 30 + 130 + 200; // 360px
                // 每个学习日期栏的宽度
                const reviewColumnWidth = 42;
                
                // 获取所有学习日期单元格（按列分）
                const reviewDateColumns = [];
                for (let i = 0; i < 8; i++) { // 8个学习日期列
                    const column = this.containerEl.querySelectorAll(`.review-cell:nth-child(${i + 4})`);
                    reviewDateColumns.push(column);
                }
                
                // 计算可以显示的学习日期列数
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

    // 新增计算学习序号的方法
    private calculateReviewNumber(rowNum: number, colIndex: number): number {
        // 如果是第一行，显示 1
        if (rowNum === 1) {
            return colIndex === 0 ? 1 : 0;  // 第一行只在第一列显示1，其他都是 '-'
        }

        // 根据艾宾浩斯记忆曲线表格的逻辑
        const reviewMatrix: { [key: number]: number[] } = {
            2: [2, 1],        // 第2行显示2,1
            3: [3, 2, 1],     // 第3行显示3,2,1
            4: [4, 3, 2],     // 第4行显示4,3,2
            5: [5, 4, 3],     // 第5行显示5,4,3
            6: [6, 5, 4, 2],  // 第6行显示6,5,4,2
            7: [7, 6, 5, 3],  // 第7行显示7,6,5,3
            8: [8, 7, 6, 4],  // 第8行显示8,7,6,4
            9: [9, 8, 7, 5],  // 第9行显示9,8,7,5
            10: [10, 9, 8, 6], // 第10行显示10,9,8,6
            11: [11, 10, 9, 7], // 第11行显示11,10,9,7
            12: [12, 11, 10, 8], // 第12行显示12,11,10,8
            13: [13, 12, 11, 9], // 第13行显示13,12,11,9
            14: [14, 13, 12, 10], // 第14行显示14,13,12,10
            15: [15, 14, 13, 11], // 第15行显示15,14,13,11
            16: [16, 15, 14, 12], // 第16行显示16,15,14,12
            17: [17, 16, 15, 13, 10], // 第17行显示17,16,15,13,10
            18: [18, 17, 16, 14, 11], // 第18行显示18,17,16,14,11
            19: [19, 18, 17, 15, 12], // 第19行显示19,18,17,15,12
            20: [20, 19, 18, 16, 13], // 第20行显示20,19,18,16,13
            21: [21, 20, 19, 17, 14]  // 第21行显示21,20,19,17,14
        };

        // 如果当前行号存在于矩阵中，且列索引在该行的数组长度范围内
        if (reviewMatrix[rowNum] && colIndex < reviewMatrix[rowNum].length) {
            return reviewMatrix[rowNum][colIndex];
        }
        
        return 0;  // 返回0表示显示'-'
    }

    private render() {
        // 在这里实现视图更新逻辑
        console.log("Rendering view with review data:", this.reviewData);
        // 例如，更新 DOM 元素或其他 UI 组件
    }

    // 添加新建学习计划的方法
    private async createNewReviewPlan() {
        // 生成文件名，格式：YYYY-MM-DD-HH-mm-ss-review-plan.md
        const date = new Date();
        const fileName = `${date.getFullYear()}-${
            String(date.getMonth() + 1).padStart(2, '0')}-${
            String(date.getDate()).padStart(2, '0')}-${
            String(date.getHours()).padStart(2, '0')}-${
            String(date.getMinutes()).padStart(2, '0')}-${
            String(date.getSeconds()).padStart(2, '0')}-review-plan.md`;
        
        // 确保目录存在
        const directory = this.plugin.settings.dataDirectory;
        if (!(await this.app.vault.adapter.exists(directory))) {
            await this.app.vault.createFolder(directory);
        }

        // 生成文件路径
        const filePath = `${directory}/${fileName}`;

        // 生成初始内容
        const initialContent = this.generateInitialContent();

        try {
            // 创建文件
            const file = await this.app.vault.create(filePath, initialContent);
            
            // 刷新文件列表
            await this.loadReviewPlanFiles();
            
            // 更新下拉框
            const fileSelector = this.containerEl.querySelector('.file-select') as HTMLSelectElement;
            if (fileSelector) {
                fileSelector.innerHTML = '<option value="">请选择学习计划</option>';
                this.reviewPlanFiles.forEach(file => {
                    const option = fileSelector.createEl("option", {
                        text: file.basename,
                        value: file.path
                    });
                });
                
                // 选中新创建的文件
                fileSelector.value = file.path;
                
                // 触发change事件
                fileSelector.dispatchEvent(new Event('change'));
            }

            new Notice('成功创建新的学习计划！');
        } catch (error) {
            new Notice('创建学习计划失败！');
            console.error('Failed to create review plan:', error);
        }
    }

    // 生成初始文件内容
    private generateInitialContent(): string {
        return `---
created: ${new Date().toISOString()}
type: review-plan
---

# Learning Content

# Day planner

`;
    }
}
