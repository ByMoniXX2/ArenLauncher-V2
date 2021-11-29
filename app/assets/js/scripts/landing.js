/**
 * Script for landing.ejs
 */

// Requirements
const cp                      = require('child_process')
const crypto                  = require('crypto')
const {URL}                   = require('url')
const {Remarkable}            = require('remarkable')
const fs                      = require('fs-extra')
const chokidar                = require('chokidar')

// Internal Requirements
const DiscordWrapper          = require('./assets/js/discordwrapper')
const Mojang                  = require('./assets/js/mojang')
const ModRealmsRest           = require('./assets/js/modrealms')
const ProcessBuilder          = require('./assets/js/processbuilder')
const ServerStatus            = require('./assets/js/serverstatus')

// Launch Elements
const launch_content          = document.getElementById('launch_content')
const launch_details          = document.getElementById('launch_details')
const launch_progress         = document.getElementById('launch_progress')
const launch_progress_label   = document.getElementById('launch_progress_label')
const launch_details_text     = document.getElementById('launch_details_text')
const server_selection_button = document.getElementById('server_selection_button')
const user_text               = document.getElementById('user_text')

const loggerLanding = LoggerUtil('%c[Landing]', 'color: #000668; font-weight: bold')
const loggerAEx = LoggerUtil('%c[AEx]', 'color: #353232; font-weight: bold')
const loggerLaunchSuite = LoggerUtil('%c[LaunchSuite]', 'color: #000668; font-weight: bold')
const loggerMetrics = LoggerUtil('%c[ModRealms Metrics]', 'color: #7289da; font-weight: bold')

/* Launch Progress Wrapper Functions */

/**
 * Show/hide the loading area.
 * 
 * @param {boolean} loading True if the loading area should be shown, otherwise false.
 */
function toggleLaunchArea(loading){
    if(loading){
        launch_details.style.display = 'flex'
        launch_content.style.display = 'none'
    } else {
        launch_details.style.display = 'none'
        launch_content.style.display = 'inline-flex'
    }
}

/**
 * Set the details text of the loading area.
 * 
 * @param {string} details The new text for the loading details.
 */
function setLaunchDetails(details){
    launch_details_text.innerHTML = details
}

/**
 * Set the value of the loading progress bar and display that value.
 * 
 * @param {number} value The progress value.
 * @param {number} max The total size.
 * @param {number|string} percent Optional. The percentage to display on the progress label.
 */
function setLaunchPercentage(value, max, percent = ((value/max)*100)){
    launch_progress.setAttribute('max', max)
    launch_progress.setAttribute('value', value)
    launch_progress_label.innerHTML = percent + '%'
}

/**
 * Set the value of the OS progress bar and display that on the UI.
 * 
 * @param {number} value The progress value.
 * @param {number} max The total download size.
 * @param {number|string} percent Optional. The percentage to display on the progress label.
 */
function setDownloadPercentage(value, max, percent = ((value/max)*100)){
    remote.getCurrentWindow().setProgressBar(value/max)
    setLaunchPercentage(value, max, percent)
    DiscordWrapper.updateDetails('Descargando... (' + percent + '%)')
}

/**
 * Enable or disable the launch button.
 * 
 * @param {boolean} val True to enable, false to disable.
 */
function setLaunchEnabled(val){
    document.getElementById('launch_button').disabled = !val
}

/**
 * Enable or disable the launch button.
 *
 * @param {string} the text to set the launch button to.
 */
function setLaunchButtonText(text){
    document.getElementById('launch_button').innerHTML = text
}

// Bind launch button
document.getElementById('launch_button').addEventListener('click', function(e){
    if(checkCurrentServer(true)){
        if(ConfigManager.getConsoleOnLaunch()){
            let window = remote.getCurrentWindow()
            window.toggleDevTools()
        }

        loggerLanding.log('Launching game..')
        const mcVersion = DistroManager.getDistribution().getServer(ConfigManager.getSelectedServer()).getMinecraftVersion()
        const jExe = ConfigManager.getJavaExecutable()
        if(jExe == null){
            asyncSystemScan(mcVersion)
        } else {

            setLaunchDetails(Lang.queryJS('landing.launch.pleaseWait'))
            toggleLaunchArea(true)
            setLaunchPercentage(0, 100)

            const jg = new JavaGuard(mcVersion)
            jg._validateJavaBinary(jExe).then((v) => {
                loggerLanding.log('Java version meta', v)
                if(v.valid){
                    dlAsync()
                } else {
                    asyncSystemScan(mcVersion)
                }
            })
        }
    }
})

// Bind settings button
document.getElementById('settingsMediaButton').onclick = (e) => {
    prepareSettings()
    switchView(getCurrentView(), VIEWS.settings)
    if(hasRPC){
        DiscordWrapper.updateDetails('En la configuracion...')
        DiscordWrapper.clearState()
    }
}

document.getElementById('openInstanceMediaButton').onclick = (e) => {
    let INSTANCE_PATH = path.join(ConfigManager.getDataDirectory(), 'instances', ConfigManager.getSelectedServer())
    let INSTANCES_PATH = path.join(ConfigManager.getDataDirectory(), 'instances')
    if(ConfigManager.getSelectedServer() && fs.pathExistsSync(INSTANCE_PATH)){
        shell.openPath(INSTANCE_PATH)
    } else if (fs.pathExistsSync(INSTANCES_PATH)){
        shell.openPath(INSTANCES_PATH)
    } else {
        shell.openPath(ConfigManager.getDataDirectory())
    }
}

document.getElementById('refreshMediaButton').onclick = (e) => {
    let ele = document.getElementById('refreshMediaButton')
    ele.setAttribute('inprogress', '')
    DistroManager.pullRemote().then((data) => {
        onDistroRefresh(data)
        showMainUI(data)
        refreshModRealmsStatuses()
        setOverlayContent(
            'Launcher reiniciado ✅',
            'Esto es una confirmacion de que tu launcher se reinicio.',
            'Aceptar',
        )
    }).catch(err => {
        setOverlayContent(
            'Error actualizando la distribucion. 🧐',
            'El launcher no fue capaz de conseguir los archivos actualizados de Oblivion, y por ende esta intentando usar archivos *posiblemente* desactualizados.<br><br>Reiniciar el launcher suele arreglar este problema. <br><br>Codigo del error:<br>' + err,
            'Entendido.',
        )
    }).finally(() => {
        setOverlayHandler(() => {
            toggleOverlay(false)
        })
        setDismissHandler(() => {
            shell.openExternal('https://discord.gg/farfadox')
        })
        toggleOverlay(true, true)
        ele.removeAttribute('inprogress')
    })
}

// Bind avatar overlay button.
document.getElementById('avatarOverlay').onclick = (e) => {
    prepareSettings()
    switchView(getCurrentView(), VIEWS.settings, 250, 250, () => {
        settingsNavItemListener(document.getElementById('settingsNavAccount'), false)
    })
}

// Bind selected account
function updateSelectedAccount(authUser){
    let username = 'No Account Selected'
    if(authUser != null){
        if(authUser.displayName != null){
            username = authUser.displayName
        }
        if(authUser.uuid != null){
            document.getElementById('avatarContainer').style.backgroundImage = `url('https://mc-heads.net/body/${authUser.uuid}/right')`
        }
    }
    user_text.innerHTML = username
}
updateSelectedAccount(ConfigManager.getSelectedAccount())

function randomiseBackground() {
    let backgroundDir = fs.readdirSync(path.join(__dirname, 'assets', 'images', 'backgrounds'))
    const backgrounds = Array.from(backgroundDir.values())
    const bkid = backgrounds[Math.floor((Math.random() * backgroundDir.length))]
    document.body.style.backgroundImage = `url('assets/images/backgrounds/${bkid}')`
}

// Bind selected server
function updateSelectedServer(serv){
    server_selection_button.innerHTML = (serv != null ? serv.getName() : 'No Server Selected')
    if(getCurrentView() === VIEWS.settings){
        saveAllModConfigurations()
    }
    ConfigManager.setSelectedServer(serv != null ? serv.getID() : null)
    ConfigManager.save()
    if(getCurrentView() === VIEWS.settings){
        animateModsTabRefresh()
    }
    setLaunchEnabled(serv != null)
    if(serv){
        setLaunchButtonText(fs.pathExistsSync(path.join(ConfigManager.getDataDirectory(), 'instances', serv.getID())) ? 'JUGAR' : 'INSTALAR Y JUGAR')
    } else {
        setLaunchButtonText('JUGAR')
    }

}
// Real text is set in uibinder.js on distributionIndexDone.
server_selection_button.innerHTML = '\u2022 Cargando..'
server_selection_button.onclick = (e) => {
    e.target.blur()
    toggleServerSelection(true)
}

// Update Mojang Status Color
const refreshMojangStatuses = async function(){
    loggerLanding.log('Refrescando estado de Mojang..')

    let status = 'grey'
    let tooltipEssentialHTML = ''
    let tooltipNonEssentialHTML = ''

    try {
        const statuses = await Mojang.status()
        greenCount = 0
        greyCount = 0

        for(let i=0; i<statuses.length; i++){
            const service = statuses[i]

            if(service.essential){
                tooltipEssentialHTML += `<div class="mojangStatusContainer">
                    <span class="mojangStatusIcon" style="color: ${Mojang.statusToHex(service.status)};">&#8226;</span>
                    <span class="mojangStatusName">${service.name}</span>
                </div>`
            } else {
                tooltipNonEssentialHTML += `<div class="mojangStatusContainer">
                    <span class="mojangStatusIcon" style="color: ${Mojang.statusToHex(service.status)};">&#8226;</span>
                    <span class="mojangStatusName">${service.name}</span>
                </div>`
            }

            if(service.status === 'yellow' && status !== 'red'){
                status = 'yellow'
            } else if(service.status === 'red'){
                status = 'red'
            } else {
                if(service.status === 'grey'){
                    ++greyCount
                }
                ++greenCount
            }

        }

        if(greenCount === statuses.length){
            if(greyCount === statuses.length){
                status = 'grey'
            } else {
                status = 'green'
            }
        }

    } catch (err) {
        loggerLanding.warn('No se pudo refrescar el estado de Mojang.')
        loggerLanding.debug(err)
    }
    
    document.getElementById('mojangStatusEssentialContainer').innerHTML = tooltipEssentialHTML
    document.getElementById('mojangStatusNonEssentialContainer').innerHTML = tooltipNonEssentialHTML
    document.getElementById('mojang_status_icon').style.color = Mojang.statusToHex(status)
}

const refreshModRealmsStatuses = async function(){
    loggerLanding.log('Refrescando estado del servidor..')
    let status = 'grey'
    let tooltipServerHTML = ''
    let greenCount = 0

    // let modpacks = await ModRealmsRest.modpacks()
    // let statuses = await ModRealmsRest.status()

    ModRealmsRest.modpacks().then(modpacks => {
        ModRealmsRest.status().then(statuses => {
            if(modpacks.length !== 0){
                for(let i=0; i<statuses.length; i++){
                    const server = statuses[i]
                    const players = server.isOffline() ? 'Restarting' : `${server.players}/${server.maxPlayers}`
                    tooltipServerHTML += `<div class="modrealmsStatusContainer">
                    <span class="modrealmsStatusIcon" style="color: ${Mojang.statusToHex(server.status)};">&#8226;</span>
                    <span class="modrealmsStatusName">${server.name}</span>
                    <span class="modrealmsStatusPlayers">${players}</span>
                </div>`

                    if(server.status.toLowerCase() === 'green') ++greenCount
                }

                if(greenCount === 0){
                    status = 'red'
                } else {
                    status = 'green'
                }
            } else {
                tooltipServerHTML = `<div class="modrealmsStatusContainer">
                    <span class="modrealmsStatusName" style="text-align: center;">Parece que Farfadox no tiene servidores hmmm...</span>
                </div>`
            }

            document.getElementById('modrealmsStatusServerContainer').innerHTML = tooltipServerHTML
            document.getElementById('modrealms_status_icon').style.color = Mojang.statusToHex(status)
        })
    })
}

const refreshServerStatus = async function(fade = false){
    loggerLanding.log('Refreshing Server Status')
    const serv = DistroManager.getDistribution().getServer(ConfigManager.getSelectedServer())

    let pLabel = 'SERVER'
    let pVal = 'OFFLINE'

    try {
        const serverURL = new URL('my://' + serv.getAddress())
        const servStat = await ServerStatus.getStatus(serverURL.hostname, serverURL.port)
        if(servStat.online){
            pLabel = 'PLAYERS'
            pVal = servStat.onlinePlayers + '/' + servStat.maxPlayers
        }

    } catch (err) {
        loggerLanding.warn('No se pudo refrescar el estado del servidor, asumiendo que esta offline.')
        loggerLanding.debug(err)
    }
    if(fade){
        $('#server_status_wrapper').fadeOut(150, () => {
            document.getElementById('landingPlayerLabel').innerHTML = pLabel
            document.getElementById('player_count').innerHTML = pVal
            $('#server_status_wrapper').fadeIn(250)
        })
    } else {
        document.getElementById('landingPlayerLabel').innerHTML = pLabel
        document.getElementById('player_count').innerHTML = pVal
    }
    
}

function loadDiscord(){
    if(!ConfigManager.getDiscordIntegration()) return
    const distro = DistroManager.getDistribution()
    if(!hasRPC){
        if(distro.discord != null){
            DiscordWrapper.initRPC(distro.discord, null, '...')
            hasRPC = true
        }
    }
}

refreshMojangStatuses()
refreshModRealmsStatuses()
// Server Status is refreshed in uibinder.js on distributionIndexDone.

// Set refresh rate to once every 5 minutes.
let mojangStatusListener = setInterval(() => refreshMojangStatuses(true), 30000)
let networkStatusListener = setInterval(() => refreshModRealmsStatuses(true), 30000)
let serverStatusListener = setInterval(() => refreshServerStatus(true), 3000000)

/**
 * Shows an error overlay, toggles off the launch area.
 * 
 * @param {string} title The overlay title.
 * @param {string} desc The overlay description.
 */
function showLaunchFailure(title, desc){
    setOverlayContent(
        title,
        desc,
        'Okay'
    )
    setOverlayHandler(null)
    toggleOverlay(true)
    toggleLaunchArea(false)
}

/* System (Java) Scan */

let sysAEx
let scanAt

let extractListener

/**
 * Asynchronously scan the system for valid Java installations.
 * 
 * @param {string} mcVersion The Minecraft version we are scanning for.
 * @param {boolean} launchAfter Whether we should begin to launch after scanning. 
 */
function asyncSystemScan(mcVersion, launchAfter = true){

    setLaunchDetails('Please wait..')
    toggleLaunchArea(true)
    setLaunchPercentage(0, 100)

    const loggerSysAEx = LoggerUtil('%c[SysAEx]', 'color: #353232; font-weight: bold')

    const forkEnv = JSON.parse(JSON.stringify(process.env))
    forkEnv.CONFIG_DIRECT_PATH = ConfigManager.getLauncherDirectory()

    // Fork a process to run validations.
    sysAEx = cp.fork(path.join(__dirname, 'assets', 'js', 'assetexec.js'), [
        'JavaGuard',
        mcVersion
    ], {
        env: forkEnv,
        stdio: 'pipe'
    })
    // Stdout
    sysAEx.stdio[1].setEncoding('utf8')
    sysAEx.stdio[1].on('data', (data) => {
        loggerSysAEx.log(data)
    })
    // Stderr
    sysAEx.stdio[2].setEncoding('utf8')
    sysAEx.stdio[2].on('data', (data) => {
        loggerSysAEx.log(data)
    })
    
    sysAEx.on('message', (m) => {

        if(m.context === 'validateJava'){
            if(m.result == null){
                // If the result is null, no valid Java installation was found.
                // Show this information to the user.
                setOverlayContent(
                    'No se encontro<br>una instalacion de Java compatible',
                    'Para entrar a Farfania, necesitas una instalacion de 64 bits de java 8. Queres que te instalemos una copia? Al instalar, aceptas <a href="http://www.oracle.com/technetwork/java/javase/terms/license/index.html">los terminos y condiciones de Oracle.</a>.',
                    'Instalar java',
                    'Instalar manualmente'
                )
                setOverlayHandler(() => {
                    setLaunchDetails('Preparando descarga de Java..')
                    sysAEx.send({task: 'changeContext', class: 'AssetGuard', args: [ConfigManager.getCommonDirectory(),ConfigManager.getJavaExecutable()]})
                    sysAEx.send({task: 'execute', function: '_enqueueOpenJDK', argsArr: [ConfigManager.getDataDirectory()]})
                    toggleOverlay(false)
                })
                setDismissHandler(() => {
                    $('#overlayContent').fadeOut(150, () => {
                        //$('#overlayDismiss').toggle(false)
                        setOverlayContent(
                            'Java es requerido<br>para abrir el juego',
                            'Una instalacion valida de java es requerida. Recomiendo contactarte con Chesvin1 para mas instrucciones.',
                            'Lo entiendo',
                            'Volver atras'
                        )
                        setOverlayHandler(() => {
                            toggleLaunchArea(false)
                            toggleOverlay(false)
                        })
                        setDismissHandler(() => {
                            toggleOverlay(false, true)
                            asyncSystemScan()
                        })
                        $('#overlayContent').fadeIn(150)
                    })
                })
                toggleOverlay(true, true)

            } else {
                // Java installation found, use this to launch the game.
                ConfigManager.setJavaExecutable(m.result)
                ConfigManager.save()

                // We need to make sure that the updated value is on the settings UI.
                // Just incase the settings UI is already open.
                settingsJavaExecVal.value = m.result
                populateJavaExecDetails(settingsJavaExecVal.value)

                if(launchAfter){
                    dlAsync()
                }
                sysAEx.disconnect()
            }
        } else if(m.context === '_enqueueOpenJDK'){

            if(m.result === true){

                // Oracle JRE enqueued successfully, begin download.
                setLaunchDetails('Descargando Java..')
                sysAEx.send({task: 'execute', function: 'processDlQueues', argsArr: [[{id:'java', limit:1}]]})

            } else {

                // Oracle JRE enqueue failed. Probably due to a change in their website format.
                // User will have to follow the guide to install Java.
                setOverlayContent(
                    'Error inesperado:<br>Descarga de Java fallida',
                    'Hubo un error desconocido, instala Java manualmente!',
                    'Lo entiendo'
                )
                setOverlayHandler(() => {
                    toggleOverlay(false)
                    toggleLaunchArea(false)
                })
                toggleOverlay(true)
                sysAEx.disconnect()

            }

        } else if(m.context === 'progress'){

            switch(m.data){
                case 'download':
                    // Downloading..
                    setDownloadPercentage(m.value, m.total, m.percent)
                    break
            }

        } else if(m.context === 'complete'){

            switch(m.data){
                case 'download': {
                    // Show installing progress bar.
                    remote.getCurrentWindow().setProgressBar(2)

                    // Wait for extration to complete.
                    const eLStr = 'Extrayendo'
                    let dotStr = ''
                    setLaunchDetails(eLStr)
                    extractListener = setInterval(() => {
                        if(dotStr.length >= 3){
                            dotStr = ''
                        } else {
                            dotStr += '.'
                        }
                        setLaunchDetails(eLStr + dotStr)
                    }, 750)
                    break
                }
                case 'java':
                // Download & extraction complete, remove the loading from the OS progress bar.
                    remote.getCurrentWindow().setProgressBar(-1)

                    // Extraction completed successfully.
                    ConfigManager.setJavaExecutable(m.args[0])
                    ConfigManager.save()

                    if(extractListener != null){
                        clearInterval(extractListener)
                        extractListener = null
                    }

                    setLaunchDetails('Java instalado!')

                    if(launchAfter){
                        dlAsync()
                    }

                    sysAEx.disconnect()
                    break
            }

        } else if(m.context === 'error'){
            console.log(m.error)
        }
    })

    // Begin system Java scan.
    setLaunchDetails('Chequeando informacion del sistema..')
    sysAEx.send({task: 'execute', function: 'validateJava', argsArr: [ConfigManager.getDataDirectory()]})

}

// Keep reference to Minecraft Process
let proc
// Is DiscordRPC enabled
let hasRPC = false
// Change this if your server uses something different.
const GAME_JOINED_REGEX = /\[.+\]: Sound engine started/
const GAME_LAUNCH_REGEX = /^\[.+\]: (?:MinecraftForge .+ Initialized|ModLauncher .+ starting: .+)$/
const MIN_LINGER = 5000

let aEx
let serv
let versionData
let forgeData

let progressListener

function dlAsync(login = true){

    // Login parameter is temporary for debug purposes. Allows testing the validation/downloads without
    // launching the game.

    if(login) {
        if(ConfigManager.getSelectedAccount() == null){
            loggerLanding.error('Tienes que estar logueado a una cuenta...')
            return
        }
    }

    setLaunchDetails('Por favor, espera..')
    toggleLaunchArea(true)
    setLaunchPercentage(0, 100)

    const forkEnv = JSON.parse(JSON.stringify(process.env))
    forkEnv.CONFIG_DIRECT_PATH = ConfigManager.getLauncherDirectory()

    // Start AssetExec to run validations and downloads in a forked process.
    aEx = cp.fork(path.join(__dirname, 'assets', 'js', 'assetexec.js'), [
        'AssetGuard',
        ConfigManager.getCommonDirectory(),
        ConfigManager.getJavaExecutable()
    ], {
        env: forkEnv,
        stdio: 'pipe'
    })
    // Stdout
    aEx.stdio[1].setEncoding('utf8')
    aEx.stdio[1].on('data', (data) => {
        loggerAEx.log(data)
    })
    // Stderr
    aEx.stdio[2].setEncoding('utf8')
    aEx.stdio[2].on('data', (data) => {
        loggerAEx.log(data)
    })
    aEx.on('error', (err) => {
        loggerLaunchSuite.error('Error durante el lanzamiento', err)
        showLaunchFailure('Error durante el lanzamiento', err.message || 'See console (CTRL + Shift + i) for more details.')
    })
    aEx.on('close', (code, signal) => {
        if(code !== 0){
            loggerLaunchSuite.error(`AssetExec exited with code ${code}, assuming error.`)
            showLaunchFailure('Error During Launch', 'See console (CTRL + Shift + i) for more details.')
        }
    })

    // Establish communications between the AssetExec and current process.
    aEx.on('message', (m) => {

        if(m.context === 'validate'){
            switch(m.data){
                case 'distribution':
                    setLaunchPercentage(20, 100)
                    loggerLaunchSuite.log('Distribution Index evaluado.')
                    setLaunchDetails('Cargando informacion de version..')
                    break
                case 'version':
                    setLaunchPercentage(40, 100)
                    loggerLaunchSuite.log('Data de la version cargado')
                    setLaunchDetails('Validando integridad de los archivos..')
                    break
                case 'assets':
                    setLaunchPercentage(60, 100)
                    loggerLaunchSuite.log('Integridad de los archivos validada!')
                    setLaunchDetails('Validando integridad de librerias..')
                    break
                case 'libraries':
                    setLaunchPercentage(80, 100)
                    loggerLaunchSuite.log('Integridad de librerias validada!')
                    setLaunchDetails('Validando archivos miscelaneos..')
                    break
                case 'files':
                    setLaunchPercentage(100, 100)
                    loggerLaunchSuite.log('Validacion de archivos completa paaaaaaa B).')
                    setLaunchDetails('Descargando archivos...')
                    break
            }
        } else if(m.context === 'progress'){
            switch(m.data){
                case 'assets': {
                    const perc = (m.value/m.total)*20
                    setLaunchPercentage(40+perc, 100, parseInt(40+perc))
                    break
                }
                case 'download':
                    setDownloadPercentage(m.value, m.total, m.percent)
                    break
                case 'extract': {
                    // Show installing progress bar.
                    remote.getCurrentWindow().setProgressBar(2)

                    // Download done, extracting.
                    const eLStr = 'Extracting libraries'
                    let dotStr = ''
                    setLaunchDetails(eLStr)
                    progressListener = setInterval(() => {
                        if(dotStr.length >= 3){
                            dotStr = ''
                        } else {
                            dotStr += '.'
                        }
                        setLaunchDetails(eLStr + dotStr)
                    }, 750)
                    break
                }
            }
        } else if(m.context === 'complete'){
            switch(m.data){
                case 'download':
                    // Download and extraction complete, remove the loading from the OS progress bar.
                    remote.getCurrentWindow().setProgressBar(-1)
                    if(progressListener != null){
                        clearInterval(progressListener)
                        progressListener = null
                    }

                    setLaunchDetails('Preparando para iniciar..')
                    break
            }
        } else if(m.context === 'error'){
            switch(m.data){
                case 'download':
                    loggerLaunchSuite.error('Error durante la descarga:', m.error)
                    if(m.error.code === 'ENOENT'){
                        showLaunchFailure(
                            'Error de descarga!',
                            'No se pudo conectar a los servidores de Oblivion. Asegurate que estas usando una conexion de internet estable. Si no se soluciona, utiliza las alternativas en el discord o contactate con el staff 🧐'
                        )
                    } else {
                        showLaunchFailure(
                            'Error de descarga!',
                            'Chequea la consola (CTRL + i) para mas detalles. Contactate en Discord con el staff si el problema persiste!.'
                        )
                    }

                    remote.getCurrentWindow().setProgressBar(-1)

                    // Disconnect from AssetExec
                    aEx.disconnect()
                    break
            }
        } else if(m.context === 'validateEverything'){

            let allGood = true

            // If these properties are not defined it's likely an error.
            if(m.result.forgeData == null || m.result.versionData == null){
                loggerLaunchSuite.error('Error durante la validacion:', m.result)

                loggerLaunchSuite.error('Error durante el lanzamiento', m.result.error)
                showLaunchFailure('Error Durante Lanzamiento', 'Por favor, chequea la consola para mas detalles (CTRL + i).')

                allGood = false
            }

            forgeData = m.result.forgeData
            versionData = m.result.versionData

            if(login && allGood) {
                updateSelectedServer(DistroManager.getDistribution().getServer(ConfigManager.getSelectedServer()))
                const authUser = ConfigManager.getSelectedAccount()
                loggerLaunchSuite.log(`Enviando cuenta procesada (${authUser.displayName}) al ProcessBuilder.`)
                let pb = new ProcessBuilder(serv, versionData, forgeData, authUser, remote.app.getVersion())
                setLaunchDetails('Lanzando Juego..')
                const SERVER_JOINED_REGEX = new RegExp(`\\[.+\\]: \\[CHAT\\] ${authUser.displayName} entro a Oblivion!`)
                const SERVER_LEAVE_REGEX = new RegExp(`\\[.+\\]: \\[CHAT\\] ${authUser.displayName} salio de Oblivion!`)

                const onLoadComplete = () => {
                    toggleLaunchArea(false)
                    if(hasRPC){
                        DiscordWrapper.updateDetails('Explorando tierras olvidadas...')
                        DiscordWrapper.resetTime()
                    }
                    gameCrashReportListener()
                    proc.stdout.on('data', gameStateChange)
                    proc.stdout.removeListener('data', tempListener)
                    proc.stdout.removeListener('data', gameLaunchErrorListener)
                }
                const start = Date.now()

                // Attach a temporary listener to the client output.
                // Will wait for a certain bit of text meaning that
                // the client application has started, and we can hide
                // the progress bar stuff.
                const tempListener = function(data){
                    data = data.trim()
                    if(GAME_LAUNCH_REGEX.test(data)){
                        const diff = Date.now()-start
                        if(diff < MIN_LINGER) {
                            setTimeout(onLoadComplete, MIN_LINGER-diff)
                        } else {
                            onLoadComplete()
                        }
                    }
                }

                // Listener for Discord RPC.
                const gameStateChange = function(data){
                    data = data.trim()
                    if(SERVER_JOINED_REGEX.test(data)){
                        DiscordWrapper.updateDetails('Explorando tierras desconocidas...')
                        DiscordWrapper.resetTime()
                    }
                }

                // Listener for Discord RPC.
                const gameCrashReportListener = function(){
                    const watcher = chokidar.watch(path.join(ConfigManager.getInstanceDirectory(), serv.getID(), 'crash-reports'), {
                        persistent: true,
                        ignoreInitial: true
                    })

                    watcher.on('add', path => {
                        shell.showItemInFolder(path)
                        setOverlayContent(
                            'El juego crasheo... 🤨',
                            'Huh... Parece que tu juego acaba de crashear. Tu carpeta de crash reports ahora esta abierta. Por favor, contactate con el staff en Discord y enviales el crash report! 🧐 <br><br>Tu crash report esta ubicado en: <br> + path',
                            'Aceptar 😪',
                            'Abrir crash report'
                        )
                        setOverlayHandler(() => {
                            toggleOverlay(false)
                        })
                        setDismissHandler(() => {
                            shell.openPath(path)
                        })
                        toggleOverlay(true, true)
                    })
                }

                const gameLaunchErrorListener = function(data){
                    data = data.trim()
                    if(data.indexOf('Could not find or load main class net.minecraft.launchwrapper.Launch') > -1){
                        loggerLaunchSuite.error('El lanzamiento del juego fallo, LaunchWrapper no fue descargado correctamente.')
                        showLaunchFailure('Error durante el lanzamiento', 'El archivo principal, LaunchWrapper, fallo al descargar. Como resultado, el juego no puede abrirse.<br><br>Para arreglar esto, apaga temporalmente tu antivirus e intentalo otra vez.')
                        proc.kill(9)
                    }  else if(data.includes('net.minecraftforge.fml.relauncher.FMLSecurityManager$ExitTrappedException')){
                        loggerLaunchSuite.error('La carga del juego fallo antes de que si quiera el JVM pueda abrir una ventana!')
                        let LOG_FILE = path.join(ConfigManager.getInstanceDirectory(), serv.getID(), 'logs', 'latest.log')
                        setOverlayContent(
                            'Error durante el lanzamiento... 🤨',
                            'Parece que tu Minecraft crasheo antes de que si quiera pueda abrir el juego o que algun crash report pueda ser generado!. Una causa comun de esto es debido a que no lanzaste el launcher como administrador. Por favor intenta abrir el launcher nuevamente como administrador.<br><br>Si instalaste algun mod custom al juego, intenta deshabilitarlo y proba otra vez 😎.<br><br>Si seguis teniendo este problema despues de hacer eso, subi tu latest.log a <a href="https://ptero.co">pastebin</a> y enviaselo a algun staff en <a href="https://discord.gg/farfadox">Discord</a>!',
                            'Aceptar',
                            'Abrir latest.log'
                        )
                        setOverlayHandler(() => {
                            toggleOverlay(false)
                        })
                        setDismissHandler(() => {
                            shell.openPath(LOG_FILE)
                        })
                        toggleOverlay(true, true)
                        toggleLaunchArea(false)
                        proc.kill(9)
                    }
                }

                try {
                    // Build Minecraft process.
                    proc = pb.build()

                    // Bind listeners to stdout.
                    proc.stdout.on('data', tempListener)
                    proc.stdout.on('data', gameLaunchErrorListener)

                    setLaunchDetails('Listo 😎<br>Suerte en Oblivion!')
                    proc.on('close', (code, signal) => {
                        if(hasRPC){
                            const serv = DistroManager.getDistribution().getServer(ConfigManager.getSelectedServer())
                            DiscordWrapper.updateDetails('Listo para Jugar!')
                            DiscordWrapper.resetTime()
                        }
                    })
                } catch(err) {
                    loggerLaunchSuite.error('Error durante lanzamiento', err)
                    showLaunchFailure('Error durante el lanzamiento 😥', 'Chequea la consola (CTRL + i) para mas detalles.')
                }
            }

            // Disconnect from AssetExec
            aEx.disconnect()
        }
    })

    // Begin Validations

    // Validate Forge files.
    validateServerInformation()
}

function validateServerInformation() {
    setLaunchDetails('Cargando informacion del servidor..')
    DiscordWrapper.updateDetails('Cargando informacion del servidor...')

    DistroManager.pullRemoteIfOutdated().then(data => {
        onDistroRefresh(data)
        serv = data.getServer(ConfigManager.getSelectedServer())
        aEx.send({task: 'execute', function: 'validateEverything', argsArr: [ConfigManager.getSelectedServer(), DistroManager.isDevMode()]})
    }).catch(err => {
        loggerLaunchSuite.error('No se pudo refrescar el Distribution Index.', err)
        if(DistroManager.getDistribution() == null){
            showLaunchFailure('Error fatal 😡', 'No se pudo cargar una copia del distribution index... Por favor, chequea la consola (CTRL + i) para mas detalles, y contactate con un staff')

            // Disconnect from AssetExec
            aEx.disconnect()
        } else {
            serv = data.getServer(ConfigManager.getSelectedServer())
            aEx.send({task: 'execute', function: 'validateEverything', argsArr: [ConfigManager.getSelectedServer(), DistroManager.isDevMode()]})
        }
    })
}

/**
 * Checks the current server to ensure that they still have permission to play it (checking server code, if applicable) and open up an error overlay if specified
 * @Param {boolean} whether or not to show the error overlay
 */
function checkCurrentServer(errorOverlay = true){
    const selectedServId = ConfigManager.getSelectedServer()
    if(selectedServId){
        const selectedServ = DistroManager.getDistribution().getServer(selectedServId)
        if(selectedServ){
            if(selectedServ.getServerCode() && selectedServ.getServerCode() !== ''){
                if(!ConfigManager.getServerCodes().includes(selectedServ.getServerCode())){
                    if(errorOverlay){
                        setOverlayContent(
                            'Codigo del servidor restringido! 🐒',
                            'Parece que ya no tenes acceso al servidor!',
                            'Cambiar servidor'
                        )
                        setOverlayHandler(() => {
                            toggleServerSelection(true)
                        })
                        setDismissHandler(() => {
                            toggleOverlay(false)
                        })
                        toggleOverlay(true, true)
                    }
                    return false
                }
            }
        }
        return true
    }
}

/**
 * News Loading Functions
 */

// DOM Cache
const newsContent                   = document.getElementById('newsContent')
const newsArticleTitle              = document.getElementById('newsArticleTitle')
const newsArticleDate               = document.getElementById('newsArticleDate')
const newsArticleAuthor             = document.getElementById('newsArticleAuthor')
// const newsArticleComments           = document.getElementById('newsArticleComments')
const newsNavigationStatus          = document.getElementById('newsNavigationStatus')
const newsArticleContentScrollable  = document.getElementById('newsArticleContentScrollable')
const nELoadSpan                    = document.getElementById('nELoadSpan')

// News slide caches.
let newsActive = false
let newsGlideCount = 0

/**
 * Show the news UI via a slide animation.
 * 
 * @param {boolean} up True to slide up, otherwise false. 
 */
function slide_(up){
    const lCUpper = document.querySelector('#landingContainer > #upper')
    const lCLLeft = document.querySelector('#landingContainer > #lower > #left')
    const lCLCenter = document.querySelector('#landingContainer > #lower > #center')
    const lCLRight = document.querySelector('#landingContainer > #lower > #right')
    const newsBtn = document.querySelector('#landingContainer > #lower > #center #content')
    const landingContainer = document.getElementById('landingContainer')
    const newsContainer = document.querySelector('#landingContainer > #newsContainer')

    newsGlideCount++

    if(up){
        lCUpper.style.top = '-200vh'
        lCLLeft.style.top = '-200vh'
        lCLCenter.style.top = '-200vh'
        lCLRight.style.top = '-200vh'
        newsBtn.style.top = '130vh'
        newsContainer.style.top = '0px'
        //date.toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: 'numeric'})
        //landingContainer.style.background = 'rgba(29, 29, 29, 0.55)'
        landingContainer.style.background = 'rgba(0, 0, 0, 0.50)'
        setTimeout(() => {
            if(newsGlideCount === 1){
                lCLCenter.style.transition = 'none'
                newsBtn.style.transition = 'none'
            }
            newsGlideCount--
        }, 2000)
    } else {
        setTimeout(() => {
            newsGlideCount--
        }, 2000)
        landingContainer.style.background = null
        lCLCenter.style.transition = null
        newsBtn.style.transition = null
        newsContainer.style.top = '100%'
        lCUpper.style.top = '0px'
        lCLLeft.style.top = '0px'
        lCLCenter.style.top = '0px'
        lCLRight.style.top = '0px'
        newsBtn.style.top = '10px'
    }
}

// Bind news button.
document.getElementById('newsButton').onclick = () => {
    // Toggle tabbing.
    if(document.getElementById('newsButton').hasAttribute('selected')){
        document.getElementById('newsButton').removeAttribute('selected')
    } else {
        document.getElementById('newsButton').setAttribute('selected', '')
    }
    if(newsActive){
        $('#landingContainer *').removeAttr('tabindex')
        $('#newsContainer *').attr('tabindex', '-1')
        if(hasRPC){
            if(ConfigManager.getSelectedServer()){
                const serv = DistroManager.getDistribution().getServer(ConfigManager.getSelectedServer())
                DiscordWrapper.updateDetails('Listo para jugar!')
            } else {
                DiscordWrapper.updateDetails('En el menu...')
            }
        }
    } else {
        $('#landingContainer *').attr('tabindex', '-1')
        $('#newsContainer, #newsContainer *, #lower, #lower #center *').removeAttr('tabindex')
        if(newsAlertShown){
            document.getElementById('newsButtonText').removeAttribute('alertShown')
            $('#newsButtonAlert').fadeOut(1000)
            newsAlertShown = false
            ConfigManager.setNewsCacheDismissed(true)
            ConfigManager.save()
        }
        if(hasRPC){
            DiscordWrapper.updateDetails('Reading the News...')
            DiscordWrapper.clearState()
        }
    }
    slide_(!newsActive)
    newsActive = !newsActive
}

// Array to store article meta.
let newsArr = null

// News load animation listener.
let newsLoadingListener = null

/**
 * Set the news loading animation.
 * 
 * @param {boolean} val True to set loading animation, otherwise false.
 */
function setNewsLoading(val){
    if(val){
        const nLStr = 'Checking for News'
        let dotStr = '..'
        nELoadSpan.innerHTML = nLStr + dotStr
        newsLoadingListener = setInterval(() => {
            if(dotStr.length >= 3){
                dotStr = ''
            } else {
                dotStr += '.'
            }
            nELoadSpan.innerHTML = nLStr + dotStr
        }, 5)
    } else {
        if(newsLoadingListener != null){
            clearInterval(newsLoadingListener)
            newsLoadingListener = null
        }
    }
}

// Bind retry button.
newsErrorRetry.onclick = () => {
    $('#newsErrorFailed').fadeOut(150, () => {
        initNews()
        $('#newsErrorLoading').fadeIn(150)
    })
}

newsArticleContentScrollable.onscroll = (e) => {
    if(e.target.scrollTop > Number.parseFloat($('.newsArticleSpacerTop').css('height'))){
        newsContent.setAttribute('scrolled', '')
    } else {
        newsContent.removeAttribute('scrolled')
    }
}

/**
 * Reload the news without restarting.
 * 
 * @returns {Promise.<void>} A promise which resolves when the news
 * content has finished loading and transitioning.
 */
function reloadNews(){
    return new Promise((resolve, reject) => {
        $('#newsContent').fadeOut(150, () => {
            $('#newsErrorLoading').fadeIn(150)
            initNews().then(() => {
                resolve()
            })
        })
    })
}

let newsAlertShown = false

/**
 * Show the news alert indicating there is new news.
 */
function showNewsAlert(){
    newsAlertShown = true
    document.getElementById('newsButtonText').setAttribute('alertShown', '')
    //$(newsButtonAlert).fadeIn(150)
}

/**
 * Initialize News UI. This will load the news and prepare
 * the UI accordingly.
 * 
 * @returns {Promise.<void>} A promise which resolves when the news
 * content has finished loading and transitioning.
 */
function initNews(){

    return new Promise((resolve, reject) => {
        setNewsLoading(true)

        let news = {}
        loadNews().then(news => {

            newsArr = news.articles || null

            if(newsArr == null){
                // News Loading Failed
                setNewsLoading(false)

                $('#newsErrorLoading').fadeOut(150, () => {
                    $('#newsErrorFailed').fadeIn(150, () => {
                        resolve()
                    })
                })
            } else if(newsArr.length === 0) {
                // No News Articles
                setNewsLoading(false)

                ConfigManager.setNewsCache({
                    date: null,
                    content: null,
                    dismissed: false
                })
                ConfigManager.save()

                $('#newsErrorLoading').fadeOut(150, () => {
                    $('#newsErrorNone').fadeIn(150, () => {
                        resolve()
                    })
                })
            } else {
                // Success
                setNewsLoading(false)

                const lN = newsArr[0]
                const cached = ConfigManager.getNewsCache()
                let newHash = crypto.createHash('sha1').update(lN.content).digest('hex')
                let newDate = new Date(lN.date)
                let isNew = false

                if(cached.date != null && cached.content != null){

                    if(new Date(cached.date) >= newDate){

                        // Compare Content
                        if(cached.content !== newHash){
                            isNew = true
                            showNewsAlert()
                        } else {
                            if(!cached.dismissed){
                                isNew = true
                                showNewsAlert()
                            }
                        }

                    } else {
                        isNew = true
                        showNewsAlert()
                    }

                } else {
                    isNew = true
                    showNewsAlert()
                }

                if(isNew){
                    ConfigManager.setNewsCache({
                        date: newDate.getTime(),
                        content: newHash,
                        dismissed: false
                    })
                    ConfigManager.save()
                }

                const switchHandler = (forward) => {
                    let cArt = parseInt(newsContent.getAttribute('article'))
                    let nxtArt = forward ? (cArt >= newsArr.length-1 ? 0 : cArt + 1) : (cArt <= 0 ? newsArr.length-1 : cArt - 1)
            
                    displayArticle(newsArr[nxtArt], nxtArt+1)
                }

                document.getElementById('newsNavigateRight').onclick = () => { switchHandler(true) }
                document.getElementById('newsNavigateLeft').onclick = () => { switchHandler(false) }

                $('#newsErrorContainer').fadeOut(150, () => {
                    displayArticle(newsArr[0], 1)
                    $('#newsContent').fadeIn(150, () => {
                        resolve()
                    })
                })
            }

        })
        
    })
}

/**
 * Add keyboard controls to the news UI. Left and right arrows toggle
 * between articles. If you are on the landing page, the up arrow will
 * open the news UI.
 */
document.addEventListener('keydown', (e) => {
    if(newsActive){
        if(e.key === 'ArrowRight' || e.key === 'ArrowLeft'){
            document.getElementById(e.key === 'ArrowRight' ? 'newsNavigateRight' : 'newsNavigateLeft').click()
        }
        // Interferes with scrolling an article using the down arrow.
        // Not sure of a straight forward solution at this point.
        // if(e.key === 'ArrowDown'){
        //     document.getElementById('newsButton').click()
        // }
    } else {
        if(getCurrentView() === VIEWS.landing){
            if(e.key === 'ArrowUp'){
                document.getElementById('newsButton').click()
            }
        }
    }
})

/**
 * Display a news article on the UI.
 * 
 * @param {Object} articleObject The article meta object.
 * @param {number} index The article index.
 */
function displayArticle(articleObject, index){
    newsArticleTitle.innerHTML = articleObject.title
    newsArticleTitle.href = articleObject.link
    newsArticleAuthor.innerHTML = 'by ' + articleObject.author
    newsArticleDate.innerHTML = articleObject.date
    // newsArticleComments.innerHTML = articleObject.comments
    // newsArticleComments.href = articleObject.commentsLink

    let content = articleObject.content

    newsArticleContentScrollable.innerHTML = '<div id="newsArticleContentWrapper"><div class="newsArticleSpacerTop"></div>' + content + '<div class="newsArticleSpacerBot"></div></div>'
    Array.from(newsArticleContentScrollable.getElementsByClassName('bbCodeSpoilerButton')).forEach(v => {
        v.onclick = () => {
            const text = v.parentElement.getElementsByClassName('bbCodeSpoilerText')[0]
            text.style.display = text.style.display === 'block' ? 'none' : 'block'
        }
    })
    newsNavigationStatus.innerHTML = index + ' of ' + newsArr.length
    newsContent.setAttribute('article', index-1)
}

/**
 * Load news information from the RSS feed specified in the
 * distribution index.
 */
function loadNews(){
    return new Promise((resolve, reject) => {
        const distroData = DistroManager.getDistribution()
        const newsFeed = distroData.getRSS()
        const newsHost = new URL(newsFeed).origin + '/'
        $.ajax({
            url: newsFeed,
            success: (data) => {
                const items = $(data).find('item')
                const articles = []

                for(let i=0; i<items.length; i++){
                // JQuery Element
                    const el = $(items[i])

                    // Resolve date.
                    const date = new Date(el.find('pubDate').text()).toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: 'numeric'})

                    // Resolve comments.
                    // let comments = el.find('slash\\:comments').text() || '0'
                    // comments = comments + ' Comment' + (comments === '1' ? '' : 's')

                    // Fix relative links in content.
                    let content = el.find('content\\:encoded').text()
                    let regex = /src="(?!http:\/\/|https:\/\/)(.+?)"/g
                    let matches
                    while((matches = regex.exec(content))){
                        content = content.replace(`"${matches[1]}"`, `"${newsHost + matches[1]}"`)
                    }

                    let link   = el.find('link').text()
                    let title  = el.find('title').text()
                    let author = el.find('dc\\:creator').text()

                    // Generate article.
                    articles.push(
                        {
                            link,
                            title,
                            date,
                            author,
                            content,
                            // comments,
                            // commentsLink: link + '#comments'
                        }
                    )
                }
                resolve({
                    articles
                })
            },
            timeout: 2500
        }
        ).catch(err => {
            resolve({
                articles: null
            })
        })
    })
}
