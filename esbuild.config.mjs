import esbuild from "esbuild";
import process from "process";
import os from 'os';
import fs from 'fs';
import path from 'path';

const prod = (process.argv[2] === "production");

const getPluginPath = () => {
    const platform = os.platform();
    console.log(`当前操作系统: ${platform}`);
    console.log(`系统详细信息: ${os.type()} ${os.release()}`);
    
    if (platform === 'darwin') { // macOS
        const path = '/Users/hongminfeng/Documents/obsidian/.obsidian/plugins/my-plugin/';
        console.log(`使用 macOS 路径: ${path}`);
        return path;
    } else if (platform === 'win32') { // Windows
        const path = 'D:\\ideaProject\\work-space\\.obsidian\\plugins\\my-plugin\\';
        console.log(`使用 Windows 路径: ${path}`);
        return path;
    }
    throw new Error('不支持的操作系统');
};

const copyAllFiles = async (targetDir) => {
    const filesToCopy = ['main.js', 'manifest.json', 'styles.css'];
    console.log('开始拷贝所有文件...');
    
    for (const file of filesToCopy) {
        try {
            const sourceFile = file === 'main.js' ? path.join('dist', file) : file;
            if (fs.existsSync(sourceFile)) {
                await fs.promises.copyFile(sourceFile, path.join(targetDir, file));
                console.log(`成功拷贝 ${file} 到 ${targetDir}`);
            } else {
                console.log(`警告: ${file} 不存在，跳过拷贝`);
            }
        } catch (err) {
            console.error(`拷贝 ${file} 失败:`, err);
        }
    }
};

const pluginPath = getPluginPath();

// 创建构建上下文
const buildOptions = {
    entryPoints: ["main.ts"],
    bundle: true,
    external: ["obsidian"],
    format: "cjs",
    target: "es2018",
    logLevel: "info",
    sourcemap: prod ? false : "inline",
    treeShaking: true,
    outfile: "dist/main.js", // 先输出到 dist 目录
};

if (prod) {
    // 生产模式：构建一次后退出
    await esbuild.build(buildOptions);
    await copyAllFiles(pluginPath);
    process.exit(0);
} else {
    // 确保 dist 目录存在
    if (!fs.existsSync('dist')) {
        fs.mkdirSync('dist');
    }

    // 开发模式：使用 watch 模式
    const context = await esbuild.context(buildOptions);
    
    // 启动监视
    await context.watch();
    console.log('[watch] 构建完成，正在监视文件变更...');

    // 创建防抖函数
    let debounceTimer;
    const debounceCopy = () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            copyAllFiles(pluginPath);
        }, 100); // 100ms 延迟
    };

    // 监视所有相关文件
    const filesToWatch = ['manifest.json', 'styles.css', 'dist/main.js'];
    filesToWatch.forEach(file => {
        const dir = path.dirname(file);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        fs.watch(dir, async (eventType, filename) => {
            if (filename && filesToWatch.includes(path.join(dir, filename))) {
                console.log(`检测到 ${filename} 发生变更`);
                debounceCopy();
            }
        });
    });

    // 初始拷贝
    await copyAllFiles(pluginPath);
}
