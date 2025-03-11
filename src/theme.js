const { exec } = require('./exec');
const path = require("path");
const { hasWavemakerCodegen, hasValidNodeVersion } = require("./requirements");
const logger = require('./logger');
const loggerLabel = 'wm-rn-codegen';

async function generateTheme(themeName, themePath){
    try{
        if(process.env.WAVEMAKER_STUDIO_FRONTEND_CODEBASE && await hasValidNodeVersion()){
            const codegen=`${process.env.WAVEMAKER_STUDIO_FRONTEND_CODEBASE}/wavemaker-rn-codegen/build/index.js`;
            await exec("node", [codegen, 'theme', 'generate', themeName, themePath]);
        }else if(await hasWavemakerCodegen()){
            await exec("wm-rn-codegen",['theme', 'generate', themeName, themePath]);
        }else{
            logger.info({
                label: loggerLabel,
                message: "wm-rn-codegen is not available"
            });
        }
    }catch(e){
        logger.error({
            label: loggerLabel,
            message: 'THEME GENERATION Failed. Due to :' + e
        })
        return e;
    }
}

async function compileTheme(themePath){
    try{
        if(process.env.WAVEMAKER_STUDIO_FRONTEND_CODEBASE && await hasValidNodeVersion()){
            const codegen=`${process.env.WAVEMAKER_STUDIO_FRONTEND_CODEBASE}/wavemaker-rn-codegen/build/index.js`;
            await exec("node", [codegen, 'theme', 'compile', themePath]);
        }else if(await hasWavemakerCodegen()){
            await exec("wm-rn-codegen",['theme', 'compile', themePath]);
        }else{
            logger.info({
                label: loggerLabel,
                message: "wm-rn-codegen is not available"
            });
        }
    }catch(e){
        logger.error({
            label: loggerLabel,
            message: 'THEME COMPILE Failed. Due to :' + e
        })
        return e;
    }
}

async function updateTheme(themePath){
    try{
        if(process.env.WAVEMAKER_STUDIO_FRONTEND_CODEBASE && await hasValidNodeVersion()){
            const codegen=`${process.env.WAVEMAKER_STUDIO_FRONTEND_CODEBASE}/wavemaker-rn-codegen/build/index.js`;
            await exec("node", [codegen, 'theme', 'update', themePath]);
        }else if(await hasWavemakerCodegen()){
            await exec("wm-rn-codegen",['theme', 'update', themePath]);
        }else{
            logger.info({
                label: loggerLabel,
                message: "wm-rn-codegen is not available"
            });
        }
    }catch(e){
        logger.error({
            label: loggerLabel,
            message: 'THEME UPDATE Failed. Due to :' + e
        })
        return e;
    }
}

async function updateThemeArtifacts(themePath){
    try{
        if(process.env.WAVEMAKER_STUDIO_FRONTEND_CODEBASE && await hasValidNodeVersion()){
            const codegen=`${process.env.WAVEMAKER_STUDIO_FRONTEND_CODEBASE}/wavemaker-rn-codegen/build/index.js`;
            const args = ['theme', 'update-artifacts'];
            if (themePath) {
                args.push(themePath);
            }
            await exec("node", [codegen, ...args]);        
        }else if(await hasWavemakerCodegen()){
            const args = ['theme', 'update-artifacts'];
            if (themePath) {
                args.push(themePath);
            }
            await exec("wm-rn-codegen",args);        
        }else{
            logger.info({
                label: loggerLabel,
                message: "wm-rn-codegen is not available"
            });
        }
    }catch(e){
        logger.error({
            label: loggerLabel,
            message: 'UPDATE THEME ARTIFACTS Failed. Due to :' + e
        })
        return e;
    }
}

module.exports={
    generateTheme,
    compileTheme,
    updateTheme,
    updateThemeArtifacts
}