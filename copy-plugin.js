const fs = require('fs');
const path = require('path');

const sourceDir = __dirname;
const targetDir = 'D:\\ideaProject\\work-space\\.obsidian\\plugins\\my-plugin\\';

const filesToCopy = ['main.js', 'styles.css', 'manifest.json'];

filesToCopy.forEach(file => {
    const sourcePath = path.join(sourceDir, file);
    const targetPath = path.join(targetDir, file);
    
    fs.copyFile(sourcePath, targetPath, (err) => {
        if (err) throw err;
        console.log(`${file} was copied to ${targetDir}`);
    });
});
