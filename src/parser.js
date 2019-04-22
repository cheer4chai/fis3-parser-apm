import fs from 'fs';
import path from 'path';
import Package from './package.js';

const SEP = new RegExp('\\' + path.sep, 'g');
const defaultPath2url = x => JSON.stringify(x.replace(/\.js$/, ''));
let singleton;

export default class Parser {
    constructor(projectPath) {
        this.modulesPath = this.resolveModulesPath(projectPath);
        this.projectPath = path.resolve(projectPath);
    }
    static create(projectPath) {
        if (!singleton) {
            singleton = new Parser(projectPath);
        }
        return singleton;
    }
    amdConfig(path2url, fileObj) {
        path2url = path2url || defaultPath2url;
        let lines = Package.getInstalledPackageDirs(this.modulesPath)
        .map(dir => {
            let file = dir + '.js';
            if (fileObj.cache) {
                fileObj.cache.addDeps(file);
            }
            let relativePath = this.relativePath(file);
            let url = path2url(relativePath);
            let id = this.amdID(file);
            return `    "${id}": ${url}`;
        });

        return '{\n' + lines.join(',\n') + '\n}';
    }
    relativePath(fullpath) {
        return fullpath.replace(this.projectPath, '').replace(SEP, '/');
    }
    amdID(fullpath) {
        return fullpath.replace(this.modulesPath, '')
            .replace(/\.js$/, '')
            .replace(SEP, '/')
            .replace(/^\//, '');
    }
    resolveModulesPath(projectPath) {
        let filepath = this.findPackageJson(projectPath);
        if (!filepath) {
            return path.resolve(projectPath, 'amd_modules');
        }
        let pkg = Package.loadJson(filepath);
        let relativePath = pkg.amdPrefix || 'amd_modules';
        return path.resolve(filepath, '..', relativePath);
    }
    findPackageJson(dir) {
        let pathname = path.resolve(dir, 'package.json');
        if (fs.existsSync(pathname)) {
            return pathname;
        }
        let parent = path.resolve(dir, '..');
        if (parent === dir) {
            return null;
        }
        return this.findPackageJson(parent);
    }
    inModules(fullname) {
        return fullname.indexOf(this.modulesPath) === 0;
    }
    isEntryFile(fullname) {
        if (!this.inModules(fullname)) {
            return false;
        }
        if (path.extname(fullname) !== '.js') {
            return false;
        }
        // fullname: /Users/harttle/test/amd_modules/ralltiir.js
        // relative: ralltiir
        let relative = fullname.slice(this.modulesPath.length + 1, -3);
        let tokens = relative.split('/');
        if (tokens.length > 2) {
            return false;
        }
        if (tokens.length === 2) {
            return relative[0] === '@' ? relative : false;
        }
        return relative;
    }
    inlinePackage(id) {
        let file = path.resolve(this.modulesPath, id) + '.js';
        let relative = this.relativePath(file);
        return '__inline(' + JSON.stringify(relative) + ');';
    }
    inlineDependencies(entryfile, pkgName) {
        let pkgPath = path.resolve(this.modulesPath, pkgName) + path.sep;
        let inlines = Package.getDependencies(entryfile)
            .filter(fullname => fullname.indexOf(pkgPath) === 0)
            .map(file => this.relativePath(file))
            .map(path => '__inline(' + JSON.stringify(path) + ');');
        return inlines.join('\n');
    }
    parse(content, file, settings) {
        let pkgName = this.isEntryFile(file.fullname);
        if (pkgName) {
            return content + ';\n' + this.inlineDependencies(file.fullname, pkgName);
        }
        return content
        .replace(
            /__inlinePackage\(['"](.*)['"]\)/g,
            (match, id) => this.inlinePackage(id)
        )
        .replace(
            /__AMD_CONFIG/g,
            () => this.amdConfig(settings.path2url, file)
        );
    }
}
