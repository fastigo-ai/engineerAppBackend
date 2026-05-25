import fs from 'fs';
import path from 'path';

function replaceInFile(filePath, replacements) {
    if (!fs.existsSync(filePath)) return;
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;
    for (const [regex, replacement] of replacements) {
        content = content.replace(regex, replacement);
    }
    if (content !== original) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Updated: ${filePath}`);
    }
}

function getAllFiles(dir) {
    let results = [];
    if (!fs.existsSync(dir)) return results;
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            results = results.concat(getAllFiles(file));
        } else {
            if (file.endsWith('.js') && !file.includes('node_modules') && !file.includes('engineerAppBackend\\update-')) {
                results.push(file);
            }
        }
    });
    return results;
}

// 1. Fix internal relative imports inside specific moved files
const engineerServiceReplacements = [
    [/from ['"]\.\.\/models\/BankAccount\.js['"]/g, 'from "../finance/BankAccount.model.js"'],
    [/\.\.\/models\//g, '../../models/']
];
replaceInFile('src/modules/engineer/profile/engineer.service.js', engineerServiceReplacements);

const genericControllerReplacements = [
    [/from ['"]\.\.\/\.\.\/services\/engineerService\.js['"]/g, 'from "../profile/engineer.service.js"'],
    [/from ['"]\.\.\/engineerService\.js['"]/g, 'from "../profile/engineer.service.js"'],
    [/\.\.\/\.\.\/models\//g, '../../../models/'],
    [/\.\.\/\.\.\/services\//g, '../../../services/'],
    [/\.\.\/\.\.\/config\//g, '../../../config/'],
    [/\.\.\/\.\.\/utils\//g, '../../../utils/'],
    [/\.\.\/\.\.\/middleware\//g, '../../../middleware/']
];

replaceInFile('src/modules/engineer/location/nearby.controller.js', genericControllerReplacements);
replaceInFile('src/modules/engineer/requests/request.controller.js', genericControllerReplacements);
replaceInFile('src/modules/engineer/requests/request_new.controller.js', genericControllerReplacements);
replaceInFile('src/modules/engineer/vendor-requests/vendor-request.controller.js', genericControllerReplacements);

const financeControllerReplacements = [
    ...genericControllerReplacements,
    [/from ['"]\.\.\/\.\.\/models\/BankAccount\.js['"]/g, 'from "./BankAccount.model.js"']
];
replaceInFile('src/modules/engineer/finance/finance.controller.js', financeControllerReplacements);

const engineerControllerReplacements = [
    [/from ['"]\.\.\/services\/engineerService\.js['"]/g, 'from "./engineer.service.js"'],
    [/from ['"]\.\.\/models\/BankAccount\.js['"]/g, 'from "../finance/BankAccount.model.js"'],
    [/\.\.\/models\//g, '../../models/'],
    [/\.\.\/services\//g, '../../services/'],
    [/\.\.\/config\//g, '../../config/'],
    [/\.\.\/utils\//g, '../../utils/'],
    [/\.\.\/middleware\//g, '../../middleware/']
];
replaceInFile('src/modules/engineer/profile/engineer.controller.js', engineerControllerReplacements);

// 2. Fix global imports everywhere else
const files = getAllFiles(path.join(process.cwd(), 'src'));

const globalReplacements = [
    // Models
    [/from ['"](.*)models\/engineersModal(\.js)?['"]/g, 'from "$1modules/auth/engineer/engineer.model.js"'],
    [/from ['"](.*)models\/BankAccount(\.js)?['"]/g, 'from "$1modules/engineer/finance/BankAccount.model.js"'],
    
    // Services
    [/from ['"](.*)services\/engineerService(\.js)?['"]/g, 'from "$1modules/engineer/profile/engineer.service.js"'],

    // Routes (for server.js mostly)
    [/from ['"](.*)routes\/engineerRoutes(\.js)?['"]/g, 'from "$1modules/engineer/index.js"'],

    // Controllers
    [/from ['"](.*)controllers\/engineerController(\.js)?['"]/g, 'from "$1modules/engineer/profile/engineer.controller.js"']
];

files.forEach(file => {
    // Skip the files we already modified internally to avoid double-replacing `../`
    if (file.includes('modules\\engineer')) return;
    replaceInFile(file, globalReplacements);
});

// Explicit fix for swagger-endpoints.js
replaceInFile('src/swagger-endpoints.js', [
    [/from '\.\/routes\/engineerRoutes\.js'/g, "from './modules/engineer/index.js'"]
]);

console.log('Done replacing engineer imports.');
