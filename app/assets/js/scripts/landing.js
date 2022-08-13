/**
 * Script for landing.ejs
 */
// Requirements
const cp = require('child_process')
const crypto = require('crypto')
const { URL } = require('url')
const fs = require('fs-extra')

// Internal Requirements
const DiscordWrapper = require('./assets/js/discordwrapper')
const Mojang = require('./assets/js/mojang')
const ProcessBuilder = require('./assets/js/processbuilder')
const ServerStatus = require('./assets/js/serverstatus')

// Launch Elements
const launch_content = document.getElementById('launch_content')
const launch_details = document.getElementById('launch_details')
const launch_progress = document.getElementById('launch_progress')
const launch_progress_label = document.getElementById('launch_progress_label')
const launch_details_text = document.getElementById('launch_details_text')
const server_selection_button = document.getElementById('server_selection_button')
const user_text = document.getElementById('user_text')

const loggerLanding = LoggerUtil('%c[Landing]', 'color: #000668; font-weight: bold')

/* Launch Progress Wrapper Functions */

/**
 * Show/hide the loading area.
 * 
 * @param {boolean} loading True if the loading area should be shown, otherwise false.
 */
function toggleLaunchArea(loading) {
    if (loading) {
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
function setLaunchDetails(details) {
    launch_details_text.innerHTML = details
}

/**
 * Set the value of the loading progress bar and display that value.
 * 
 * @param {number} value The progress value.
 * @param {number} max The total size.
 * @param {number|string} percent Optional. The percentage to display on the progress label.
 */
function setLaunchPercentage(value, max, percent = ((value / max) * 100)) {
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
function setDownloadPercentage(value, max, percent = ((value / max) * 100)) {
    remote.getCurrentWindow().setProgressBar(value / max)
    setLaunchPercentage(value, max, percent)
    DiscordWrapper.updateDetails('Téléchargement en cours... (' + percent + '%)')
}

/**
 * Enable or disable the launch button.
 * 
 * @param {boolean} val True to enable, false to disable.
 */
function setLaunchEnabled(val) {
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
document.getElementById('launch_button').addEventListener('click', function (e) {
    if (checkCurrentServer(true)) {
        if (ConfigManager.getConsoleOnLaunch()) {
            let window = remote.getCurrentWindow()
            window.toggleDevTools()
        }
        loggerLanding.log('Launching game..')
        const mcVersion = DistroManager.getDistribution().getServer(ConfigManager.getSelectedServer()).getMinecraftVersion()
        const jExe = ConfigManager.getJavaExecutable()
        if (jExe == null) {
            asyncSystemScan(mcVersion)
        } else {

            setLaunchDetails(Lang.queryJS('landing.launch.pleaseWait'))
            toggleLaunchArea(true)
            setLaunchPercentage(0, 100)

            const jg = new JavaGuard(mcVersion)
            jg._validateJavaBinary(jExe).then((v) => {
                loggerLanding.log('Java version meta', v)
                if (v.valid) {
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
    if (hasRPC) {
        DiscordWrapper.updateDetails('Dans les réglages...')
        DiscordWrapper.clearState()
    }
}

// Bind avatar overlay button.
document.getElementById('avatarOverlay').onclick = (e) => {
    prepareSettings()
    switchView(getCurrentView(), VIEWS.settings, 500, 500, () => {
        settingsNavItemListener(document.getElementById('settingsNavAccount'), false)
    })
}

// Bind selected account
function updateSelectedAccount(authUser) {
    let username = 'No Account Selected'
    if (authUser != null) {
        if (authUser.displayName != null) {
            username = authUser.displayName
        }
        if(authUser.uuid != null){
            document.getElementById('avatarContainer').style.backgroundImage = `url('https://mc-heads.net/body/${authUser.uuid}/right')`
        }
    }
    user_text.innerHTML = username
}
updateSelectedAccount(ConfigManager.getSelectedAccount())

// Bind selected server
function updateSelectedServer(serv) {
    server_selection_button.innerHTML = (serv != null ? serv.getName() : 'Aucun serveur séléctionné')
    if (getCurrentView() === VIEWS.settings) {
        saveAllModConfigurations()
    }
    ConfigManager.setSelectedServer(serv != null ? serv.getID() : null)
    ConfigManager.save()
    if (getCurrentView() === VIEWS.settings) {
        animateModsTabRefresh()
    }
    setLaunchEnabled(serv != null)
    if(serv){
        setLaunchButtonText(fs.pathExistsSync(path.join(ConfigManager.getDataDirectory(), 'instances', serv.getID())) ? 'JOUER' : 'INSTALLER</br>ET JOUER')
    } else {
        setLaunchButtonText('JOUER')
    }


}
// Real text is set in uibinder.js on distributionIndexDone.
server_selection_button.innerHTML = '\u2022 Chargement...'
server_selection_button.onclick = (e) => {
    e.target.blur()
    toggleServerSelection(true)
}

// Update Mojang Status Color
const refreshMojangStatuses = async function () {
    loggerLanding.log('Refreshing Mojang Statuses..')

    let status = 'grey'
    let tooltipEssentialHTML = ''
    let tooltipNonEssentialHTML = ''

    try {
        const statuses = await Mojang.status()
        greenCount = 0
        greyCount = 0

        for (let i = 0; i < statuses.length; i++) {
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

            if (service.status === 'yellow' && status !== 'red') {
                status = 'yellow'
            } else if (service.status === 'red') {
                status = 'red'
            } else {
                if (service.status === 'grey') {
                    ++greyCount
                }
                ++greenCount
            }

        }

        if (greenCount === statuses.length) {
            if (greyCount === statuses.length) {
                status = 'grey'
            } else {
                status = 'green'
            }
        }

    } catch (err) {
        loggerLanding.warn('Unable to refresh Mojang service status.')
        loggerLanding.debug(err)
    }

    document.getElementById('mojangStatusEssentialContainer').innerHTML = tooltipEssentialHTML
    document.getElementById('mojangStatusNonEssentialContainer').innerHTML = tooltipNonEssentialHTML
    document.getElementById('mojang_status_icon').style.color = Mojang.statusToHex(status)
}

const refreshServerStatus = async function (fade = false) {
    loggerLanding.log('Actualisation du status des serveurs Mojang.')
    const serv = DistroManager.getDistribution().getServer(ConfigManager.getSelectedServer())

    let pLabel = 'SERVEUR'
    let pVal = 'HORS-LIGNE'

    try {
        const serverURL = new URL('my://' + serv.getAddress())
        const servStat = await ServerStatus.getStatus(serverURL.hostname, serverURL.port)
        if (servStat.online) {
            pLabel = 'Joueurs en ligne'
            pVal = servStat.onlinePlayers + '/' + servStat.maxPlayers
        }

    } catch (err) {
        loggerLanding.warn('Unable to refresh server status, assuming offline.')
        loggerLanding.debug(err)
    }
    if (fade) {
        $('#server_status_wrapper').fadeOut(150, () => {
            document.getElementById('landingPlayerLabel').innerHTML = pLabel
            document.getElementById('player_count').innerHTML = pVal
            $('#server_status_wrapper').fadeIn(150)
        })
    } else {
        document.getElementById('landingPlayerLabel').innerHTML = pLabel
        document.getElementById('player_count').innerHTML = pVal
    }

}

function loadDiscord() {
    if (!ConfigManager.getDiscordIntegration()) return
    const distro = DistroManager.getDistribution()
    const serv = distro.getServer(ConfigManager.getSelectedServer())

    loggerLanding.log('Now loading DiscordRPC')
    if (!hasRPC) {
        if (distro.discord != null) {
            DiscordWrapper.initRPC(distro.discord, serv.discord, '...')
            hasRPC = true
        }
    }
}

refreshMojangStatuses()
// Server Status is refreshed in uibinder.js on distributionIndexDone.

// Set refresh rate to once every 5 minutes.
let mojangStatusListener = setInterval(() => refreshMojangStatuses(true), 300000)
let serverStatusListener = setInterval(() => refreshServerStatus(true), 300000)

/**
 * Shows an error overlay, toggles off the launch area.
 * 
 * @param {string} title The overlay title.
 * @param {string} desc The overlay description.
 */
function showLaunchFailure(title, desc) {
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
function asyncSystemScan(mcVersion, launchAfter = true) {

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

        if (m.context === 'validateJava') {
            if (m.result == null) {
                // If the result is null, no valid Java installation was found.
                // Show this information to the user.
                setOverlayContent(
                    "Aucune version compatible de <br>Java n'a été trouvée",
                    'Pour rejoindre RTMC, vous devez installer Java 8 x64. Voulez-vous que nous installions Java? En insatallant, vous acceptez <a href="http://www.oracle.com/technetwork/java/javase/terms/license/index.html">La licence Java</a>.',
                    'Installer Java',
                    'Installer Manuellement'
                )
                setOverlayHandler(() => {
                    setLaunchDetails('Préparation de \'installation de Java..')
                    sysAEx.send({ task: 'changeContext', class: 'AssetGuard', args: [ConfigManager.getCommonDirectory(), ConfigManager.getJavaExecutable()] })
                    sysAEx.send({ task: 'execute', function: '_enqueueOpenJDK', argsArr: [ConfigManager.getDataDirectory()] })
                    toggleOverlay(false)
                })
                setDismissHandler(() => {
                    $('#overlayContent').fadeOut(150, () => {
                        //$('#overlayDismiss').toggle(false)
                        setOverlayContent(
                            'Java est requis pour<br>le lancement',
                            'Une installation valide de Java est requise.',
                            'Ok cool!',
                            'Retour'
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

                if (launchAfter) {
                    dlAsync()
                }
                sysAEx.disconnect()
            }
        } else if (m.context === '_enqueueOpenJDK') {

            if (m.result === true) {

                // Oracle JRE enqueued successfully, begin download.
                setLaunchDetails('Téléchargement de Java..')
                sysAEx.send({ task: 'execute', function: 'processDlQueues', argsArr: [[{ id: 'java', limit: 1 }]] })

            } else {

                // Oracle JRE enqueue failed. Probably due to a change in their website format.
                // User will have to follow the guide to install Java.
                setOverlayContent(
                    'Problème:<br>Le téléchargement Java a échoué!',
                    'Nous avons eu un problème en insallant Java. Vous devez l\'installer manuellement. <a href="https://www.java.com/inc/BrowserRedirect1.jsp?locale=fr">Installer Java</a>.',
                    'Arrrf mince. Bon ben ok!'
                )
                setOverlayHandler(() => {
                    toggleOverlay(false)
                    toggleLaunchArea(false)
                })
                toggleOverlay(true)
                sysAEx.disconnect()

            }

        } else if (m.context === 'progress') {

            switch (m.data) {
                case 'download':
                    // Downloading..
                    setDownloadPercentage(m.value, m.total, m.percent)
                    break
            }

        } else if (m.context === 'complete') {

            switch (m.data) {
                case 'download': {
                    // Show installing progress bar.
                    remote.getCurrentWindow().setProgressBar(2)

                    // Wait for extration to complete.
                    const eLStr = 'Extraction'
                    let dotStr = ''
                    setLaunchDetails(eLStr)
                    extractListener = setInterval(() => {
                        if (dotStr.length >= 3) {
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

                    if (extractListener != null) {
                        clearInterval(extractListener)
                        extractListener = null
                    }

                    setLaunchDetails('Java Installé!')

                    if (launchAfter) {
                        dlAsync()
                    }

                    sysAEx.disconnect()
                    break
            }

        } else if (m.context === 'error') {
            console.log(m.error)
        }
    })

    // Begin system Java scan.
    setLaunchDetails('Verification des informationd du système..')
    sysAEx.send({ task: 'execute', function: 'validateJava', argsArr: [ConfigManager.getDataDirectory()] })

}

// Keep reference to Minecraft Process
let proc
// Is DiscordRPC enabled
let hasRPC = false
// Joined server regex
// Change this if your server uses something different.
const GAME_JOINED_REGEX = /\[.+\]: Sound engine started/
const GAME_LAUNCH_REGEX = /^\[.+\]: (?:MinecraftForge .+ Initialized|ModLauncher .+ starting: .+)$/
const MIN_LINGER = 5000

let aEx
let serv
let versionData
let forgeData

let progressListener

function dlAsync(login = true) {

    // Login parameter is temporary for debug purposes. Allows testing the validation/downloads without
    // launching the game.

    if (login) {
        if (ConfigManager.getSelectedAccount() == null) {
            loggerLanding.error('Vous devez être connecté pour jouer.')
            return
        }
    }

    setLaunchDetails('Patientez..')
    toggleLaunchArea(true)
    setLaunchPercentage(0, 100)

    const loggerAEx = LoggerUtil('%c[AEx]', 'color: #353232; font-weight: bold')
    const loggerLaunchSuite = LoggerUtil('%c[LaunchSuite]', 'color: #000668; font-weight: bold')

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
        loggerLaunchSuite.error('Problème', err)
        showLaunchFailure('Erreur lors du lancement', err.message || 'Checkez la console (CTRL + Shift + i) pour plus d\'infos.')
    })
    aEx.on('close', (code, signal) => {
        if (code !== 0) {
            loggerLaunchSuite.error(`AssetExec s'est fermé avec l'erreur ${code}.`)
            showLaunchFailure('Problème', 'Checkez la console (CTRL + Shift + i) pour plus d\'infos.')
        }
    })

    // Establish communications between the AssetExec and current process.
    aEx.on('message', (m) => {

        if (m.context === 'validate') {
            switch (m.data) {
                case 'distribution':
                    setLaunchPercentage(20, 100)
                    loggerLaunchSuite.log('Index de la distribution vérifié.')
                    setLaunchDetails('Chargement des infos de version..')
                    break
                case 'version':
                    setLaunchPercentage(40, 100)
                    loggerLaunchSuite.log('Données de version chargées.')
                    setLaunchDetails('Vérification de l\'intégrité des données..')
                    break
                case 'assets':
                    setLaunchPercentage(60, 100)
                    loggerLaunchSuite.log('Les données sont complètes')
                    setLaunchDetails('Vérification de l\'intégrité des librairies..')
                    break
                case 'libraries':
                    setLaunchPercentage(80, 100)
                    loggerLaunchSuite.log('Les librairies sont complètes.')
                    setLaunchDetails('Vérification des fichiers divers..')
                    break
                case 'files':
                    setLaunchPercentage(100, 100)
                    loggerLaunchSuite.log('Les fichiers divers sont complets.')
                    setLaunchDetails('Téléchargement des fichiers..')
                    break
            }
        } else if (m.context === 'progress') {
            switch (m.data) {
                case 'assets': {
                    const perc = (m.value / m.total) * 20
                    setLaunchPercentage(40 + perc, 100, parseInt(40 + perc))
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
                        if (dotStr.length >= 3) {
                            dotStr = ''
                        } else {
                            dotStr += '.'
                        }
                        setLaunchDetails(eLStr + dotStr)
                    }, 750)
                    break
                }
            }
        } else if (m.context === 'complete') {
            switch (m.data) {
                case 'download':
                    // Download and extraction complete, remove the loading from the OS progress bar.
                    remote.getCurrentWindow().setProgressBar(-1)
                    if (progressListener != null) {
                        clearInterval(progressListener)
                        progressListener = null
                    }

                    setLaunchDetails('Préparation du lancement..')
                    break
            }
        } else if (m.context === 'error') {
            switch (m.data) {
                case 'download':
                    loggerLaunchSuite.error('Error while downloading:', m.error)

                    if (m.error.code === 'ENOENT') {
                        showLaunchFailure(
                            'Erreur',
                            'Impossible de télécharger les fichers. Avez-vous internet?'
                        )
                    } else {
                        showLaunchFailure(
                            'Erreur',
                            'Checkez la console (CTRL + Shift + i) pour voir l\'erreur.'
                        )
                    }

                    remote.getCurrentWindow().setProgressBar(-1)

                    // Disconnect from AssetExec
                    aEx.disconnect()
                    break
            }
        } else if (m.context === 'validateEverything') {

            let allGood = true

            // If these properties are not defined it's likely an error.
            if (m.result.forgeData == null || m.result.versionData == null) {
                loggerLaunchSuite.error('Erreur:', m.result)

                loggerLaunchSuite.error('Erreur', m.result.error)
                showLaunchFailure('Erreur pendant le lancement.', 'Checkez la console (CTRL + Shift + i) pour plus d\'infos.')

                allGood = false
            }

            forgeData = m.result.forgeData
            versionData = m.result.versionData

            if (login && allGood) {
                updateSelectedServer(DistroManager.getDistribution().getServer(ConfigManager.getSelectedServer()))
                const authUser = ConfigManager.getSelectedAccount()
                loggerLaunchSuite.log(`Envoi du compte (${authUser.displayName}) vers ProcessBuilder.`)
                let pb = new ProcessBuilder(serv, versionData, forgeData, authUser, remote.app.getVersion())
                setLaunchDetails('Lancement du jeu..')

                // const SERVER_JOINED_REGEX = /\[.+\]: \[CHAT\] [a-zA-Z0-9_]{1,16} joined the game/
                const SERVER_JOINED_REGEX = new RegExp(`\\[.+\\]: \\[CHAT\\] ${authUser.displayName} joined the game`)

                const onLoadComplete = () => {
                    toggleLaunchArea(false)
                    if (hasRPC) {
                        DiscordWrapper.updateDetails('Chargement du jeu...')
                        DiscordWrapper.resetTime()
                    }
                    proc.stdout.on('data', gameStateChange)
                    proc.stdout.removeListener('data', tempListener)
                    proc.stderr.removeListener('data', gameErrorListener)
                }
                const start = Date.now()

                // Attach a temporary listener to the client output.
                // Will wait for a certain bit of text meaning that
                // the client application has started, and we can hide
                // the progress bar stuff.
                const tempListener = function (data) {
                    if (GAME_LAUNCH_REGEX.test(data.trim())) {
                        const diff = Date.now() - start
                        if (diff < MIN_LINGER) {
                            setTimeout(onLoadComplete, MIN_LINGER - diff)
                        } else {
                            onLoadComplete()
                        }
                    }
                }



                const gameCrashReportListener = function (data) {
                    data = data.trim()
                    if (data.includes('---- Minecraft Crash Report ----')) {
                        let date = new Date()
                        let CRASH_REPORT_FOLDER = path.join(ConfigManager.getInstanceDirectory(), serv.getID(), 'crash-reports')
                        let CRASH_REPORT_NAME = ('crash-' + date.getFullYear() + '-' + (date.getMonth() + 1).toLocaleString(undefined, { minimumIntegerDigits: 2 }) + '-' + date.getDate().toLocaleString(undefined, { minimumIntegerDigits: 2 }) + '_' + date.getHours().toLocaleString(undefined, { minimumIntegerDigits: 2 }) + '.' + date.getMinutes().toLocaleString(undefined, { minimumIntegerDigits: 2 }) + '.' + date.getSeconds().toLocaleString(undefined, { minimumIntegerDigits: 2 }) + '-client.txt')
                        let CRASH_REPORT_PATH = path.join(CRASH_REPORT_FOLDER, CRASH_REPORT_NAME)
                        shell.showItemInFolder(CRASH_REPORT_PATH)
                        setOverlayContent(
                            'Le jeu a crashé!',
                            'Mince, le jeu a crashé. Nous avons ouvert le dossier des rapports d\'erreur afin que vous puissiez facilement le partager avec notre staff. Si vous rencontrez des crashs à répétition, nous vous recommandons de nous contacter!<br><br>Pour plus d\'informations, votre fichier de rapport d\'incident est: <br>' + CRASH_REPORT_NAME,
                            'Merci!',
                            'Ouvrir le rapport'
                        )
                        setOverlayHandler(() => {
                            toggleOverlay(false)
                        })
                        setDismissHandler(() => {
                            shell.openPath(CRASH_REPORT_PATH)
                        })
                        toggleOverlay(true, true)
                    }
                }
                // Listener for Discord RPC.
                const gameStateChange = function (data) {
                    data = data.trim()
                    if (SERVER_JOINED_REGEX.test(data)) {
                        DiscordWrapper.updateDetails('Exploration de RTMC...')
                    } else if (GAME_JOINED_REGEX.test(data)) {
                        //DiscordWrapper.updateDetails('En jeu sur RTMC!')
                        DiscordWrapper.resetTime()
                    }
                }

                const gameErrorListener = function (data) {
                    data = data.trim()
                    if (data.indexOf('Impossible de trouver net.minecraft.launchwrapper.Launch') > -1) {
                        loggerLaunchSuite.error('Problème de lancement du jeu, LaunchWrapper n\'a pas été téléchargé proprement.')
                        showLaunchFailure('Problème du lancement du jeu.', 'Le fichier, LaunchWrapper, n\'a pas été téléchargé proprement. Le jeu n\'a pas pu être lancé.<br><br>Veuillez essayez de désactiver temporairement votre antivirus.<br><br>Veuillez créer une issue <a href="https://github.com/GeekCornerGH/RTMC-launcher/issues">ici</a>.')
                    }
                }

                try {
                    // Build Minecraft process.
                    proc = pb.build()

                    // Bind listeners to stdout.
                    proc.stdout.on('data', tempListener)
                    proc.stderr.on('data', gameErrorListener)

                    setLaunchDetails('C\'est bon! </br> Bon jeu!')

                    proc.on('close', (code, signal) => {
                        if (hasRPC) {
                            const serv = DistroManager.getDistribution().getServer(ConfigManager.getSelectedServer())
                            DiscordWrapper.updateDetails('Prêt à jouer')
                            DiscordWrapper.updateState('Serveur: ' + serv.getName())
                            DiscordWrapper.resetTime()
                        }
                    })

                } catch (err) {

                    loggerLaunchSuite.error('Erreur!', err)
                    showLaunchFailure('Erreur lors du lancement.', 'Checkez la console (CTRL + Shift + i) pour plus de détails.')

                }
            }

            // Disconnect from AssetExec
            aEx.disconnect()

        }
    })

    // Begin Validations

    // Validate Forge files.
    setLaunchDetails('Chargement des informations de serveur..')

    refreshDistributionIndex(true, (data) => {
        onDistroRefresh(data)
        serv = data.getServer(ConfigManager.getSelectedServer())
        aEx.send({ task: 'execute', function: 'validateEverything', argsArr: [ConfigManager.getSelectedServer(), DistroManager.isDevMode()] })
    }, (err) => {
        loggerLaunchSuite.log('Impossible de télécharger les informations de serveur.', err)
        refreshDistributionIndex(false, (data) => {
            onDistroRefresh(data)
            serv = data.getServer(ConfigManager.getSelectedServer())
            aEx.send({ task: 'execute', function: 'validateEverything', argsArr: [ConfigManager.getSelectedServer(), DistroManager.isDevMode()] })
        }, (err) => {
            loggerLaunchSuite.error('Unable to refresh distribution index.', err)
            if (DistroManager.getDistribution() == null) {
                showLaunchFailure('Erreur fatale', 'Impossible de télécharger les informations de serveur. Regardez la console (CTRL + Shift + i) pour en savoir plus.')

                // Disconnect from AssetExec
                aEx.disconnect()
            } else {
                serv = data.getServer(ConfigManager.getSelectedServer())
                aEx.send({ task: 'execute', function: 'validateEverything', argsArr: [ConfigManager.getSelectedServer(), DistroManager.isDevMode()] })
            }
        })
    })
}

/**
 * Checks the current server to ensure that they still have permission to play it (checking server code, if applicable) and open up an error overlay if specified
 * @Param {boolean} whether or not to show the error overlay
 */
function checkCurrentServer(errorOverlay = true) {
    const selectedServId = ConfigManager.getSelectedServer()
    if (selectedServId) {
        const selectedServ = DistroManager.getDistribution().getServer(selectedServId)
        if (selectedServ) {
            if (selectedServ.getServerCode() && selectedServ.getServerCode() !== '') {
                if (!ConfigManager.getServerCodes().includes(selectedServ.getServerCode())) {
                    if (errorOverlay) {
                        setOverlayContent(
                            'Code 403!',
                            'On dirait que vous n\'avez plus accès au serveur. Si on vous a donné un nouveau code, rentrez-le à nouveau dans les paramètres',
                            'Changer de serveur'
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
const newsContent = document.getElementById('newsContent')
const newsArticleTitle = document.getElementById('newsArticleTitle')
const newsArticleDate = document.getElementById('newsArticleDate')
const newsArticleAuthor = document.getElementById('newsArticleAuthor')
const newsArticleComments = document.getElementById('newsArticleComments')
const newsNavigationStatus = document.getElementById('newsNavigationStatus')
const newsArticleContentScrollable = document.getElementById('newsArticleContentScrollable')
const nELoadSpan = document.getElementById('nELoadSpan')

// News slide caches.
let newsActive = false
let newsGlideCount = 0

/**
 * Show the news UI via a slide animation.
 * 
 * @param {boolean} up True to slide up, otherwise false. 
 */
function slide_(up) {
    const lCUpper = document.querySelector('#landingContainer > #upper')
    const lCLLeft = document.querySelector('#landingContainer > #lower > #left')
    const lCLCenter = document.querySelector('#landingContainer > #lower > #center')
    const lCLRight = document.querySelector('#landingContainer > #lower > #right')
    const newsBtn = document.querySelector('#landingContainer > #lower > #center #content')
    const landingContainer = document.getElementById('landingContainer')
    const newsContainer = document.querySelector('#landingContainer > #newsContainer')

    newsGlideCount++

    if (up) {
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
            if (newsGlideCount === 1) {
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
    if (newsActive) {
        $('#landingContainer *').removeAttr('tabindex')
        $('#newsContainer *').attr('tabindex', '-1')
        if (hasRPC) {
            if (ConfigManager.getSelectedServer()) {
                const serv = DistroManager.getDistribution().getServer(ConfigManager.getSelectedServer())
                DiscordWrapper.updateDetails('Prêt à jouer!')
                DiscordWrapper.updateState('Serveur: ' + serv.getName())
            } else {
                DiscordWrapper.updateDetails('Prêt à lancer le jeu...')
            }
        }
    } else {
        $('#landingContainer *').attr('tabindex', '-1')
        $('#newsContainer, #newsContainer *, #lower, #lower #center *').removeAttr('tabindex')
        if (newsAlertShown) {
            $('#newsButtonAlert').fadeOut(2000)
            newsAlertShown = false
            ConfigManager.setNewsCacheDismissed(true)
            ConfigManager.save()
        }
        if (hasRPC) {
            DiscordWrapper.updateDetails('Entrain de lire les news...')
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
function setNewsLoading(val) {
    if (val) {
        const nLStr = 'Recherche des actualités...'
        let dotStr = '..'
        nELoadSpan.innerHTML = nLStr + dotStr
        newsLoadingListener = setInterval(() => {
            if (dotStr.length >= 3) {
                dotStr = ''
            } else {
                dotStr += '.'
            }
            nELoadSpan.innerHTML = nLStr + dotStr
        }, 750)
    } else {
        if (newsLoadingListener != null) {
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
    if (e.target.scrollTop > Number.parseFloat($('.newsArticleSpacerTop').css('height'))) {
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
function reloadNews() {
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
function showNewsAlert() {
    newsAlertShown = true
    $(newsButtonAlert).fadeIn(150)
}

/**
 * Initialize News UI. This will load the news and prepare
 * the UI accordingly.
 * 
 * @returns {Promise.<void>} A promise which resolves when the news
 * content has finished loading and transitioning.
 */
function initNews() {

    return new Promise((resolve, reject) => {
        setNewsLoading(true)

        let news = {}
        loadNews().then(news => {

            newsArr = news.articles || null

            if (newsArr == null) {
                // News Loading Failed
                setNewsLoading(false)

                $('#newsErrorLoading').fadeOut(150, () => {
                    $('#newsErrorFailed').fadeIn(150, () => {
                        resolve()
                    })
                })
            } else if (newsArr.length === 0) {
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

                if (cached.date != null && cached.content != null) {

                    if (new Date(cached.date) >= newDate) {

                        // Compare Content
                        if (cached.content !== newHash) {
                            isNew = true
                            showNewsAlert()
                        } else {
                            if (!cached.dismissed) {
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

                if (isNew) {
                    ConfigManager.setNewsCache({
                        date: newDate.getTime(),
                        content: newHash,
                        dismissed: false
                    })
                    ConfigManager.save()
                }

                const switchHandler = (forward) => {
                    let cArt = parseInt(newsContent.getAttribute('article'))
                    let nxtArt = forward ? (cArt >= newsArr.length - 1 ? 0 : cArt + 1) : (cArt <= 0 ? newsArr.length - 1 : cArt - 1)

                    displayArticle(newsArr[nxtArt], nxtArt + 1)
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
    if (newsActive) {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            document.getElementById(e.key === 'ArrowRight' ? 'newsNavigateRight' : 'newsNavigateLeft').click()
        }
        // Interferes with scrolling an article using the down arrow.
        // Not sure of a straight forward solution at this point.
        // if(e.key === 'ArrowDown'){
        //     document.getElementById('newsButton').click()
        // }
    } else {
        if (getCurrentView() === VIEWS.landing) {
            if (e.key === 'ArrowUp') {
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
function displayArticle(articleObject, index) {
    newsArticleTitle.innerHTML = articleObject.title
    newsArticleTitle.href = articleObject.link
    newsArticleAuthor.innerHTML = 'par ' + articleObject.author
    newsArticleDate.innerHTML = articleObject.date
    newsArticleComments.innerHTML = articleObject.comments
    newsArticleComments.href = articleObject.commentsLink
    newsArticleContentScrollable.innerHTML = '<div id="newsArticleContentWrapper"><div class="newsArticleSpacerTop"></div>' + articleObject.content + '<div class="newsArticleSpacerBot"></div></div>'
    Array.from(newsArticleContentScrollable.getElementsByClassName('bbCodeSpoilerButton')).forEach(v => {
        v.onclick = () => {
            const text = v.parentElement.getElementsByClassName('bbCodeSpoilerText')[0]
            text.style.display = text.style.display === 'block' ? 'none' : 'block'
        }
    })
    newsNavigationStatus.innerHTML = index + ' sur ' + newsArr.length
    newsContent.setAttribute('article', index - 1)
}

/**
 * Load news information from the RSS feed specified in the
 * distribution index.
 */
function loadNews() {
    return new Promise((resolve, reject) => {
        const distroData = DistroManager.getDistribution()
        const newsFeed = distroData.getRSS()
        const newsHost = new URL(newsFeed).origin + '/'
        $.ajax({
            url: newsFeed,
            success: (data) => {
                const items = $(data).find('item')
                const articles = []

                for (let i = 0; i < items.length; i++) {
                    // JQuery Element
                    const el = $(items[i])

                    // Resolve date.
                    const date = new Date(el.find('pubDate').text()).toLocaleDateString('fr-FR', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: 'numeric' })

                    // Resolve comments.
                    let comments = el.find('slash\\:commentaires').text() || '0'
                    comments = comments + ' Commentaire' + (comments === '1' ? '' : 's')

                    // Fix relative links in content.
                    let content = el.find('content\\:encoded').text()
                    let regex = /src="(?!http:\/\/|https:\/\/)(.+?)"/g
                    let matches
                    while ((matches = regex.exec(content))) {
                        content = content.replace(`"${matches[1]}"`, `"${newsHost + matches[1]}"`)
                    }

                    let link = el.find('link').text()
                    let title = el.find('title').text()
                    let author = el.find('dc\\:creator').text()

                    // Generate article.
                    articles.push(
                        {
                            link,
                            title,
                            date,
                            author,
                            content,
                            comments,
                            commentsLink: link + '#comments'
                        }
                    )
                }
                resolve({
                    articles
                })
            },
            timeout: 2500
        }).catch(err => {
            resolve({
                articles: null
            })
        })
    })
}
