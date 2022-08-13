(function (exports, require, module, __filename, __dirname, process, global, Buffer) { return function (exports, require, module, __filename, __dirname) { class LoggerUtil {

    constructor(prefix, style){
        this.prefix = prefix
        this.style = style
    }

    log(){
        console.log.apply(null, [this.prefix, this.style, ...arguments])
    }

    info(){
        console.info.apply(null, [this.prefix, this.style, ...arguments])
    }

    warn(){
        console.warn.apply(null, [this.prefix, this.style, ...arguments])
    }

    debug(){
        console.debug.apply(null, [this.prefix, this.style, ...arguments])
    }

    error(){
        console.error.apply(null, [this.prefix, this.style, ...arguments])
    }

}

module.exports = function (prefix, style){
    return new LoggerUtil(prefix, style)
}
}.call(this, exports, require, module, __filename, __dirname); });