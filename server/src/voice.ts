import { ChannelType, PermissionFlagsBits } from 'discord.js'
import type { Guild } from 'discord.js'
import { VoiceConnectionStatus, entersState, joinVoiceChannel } from '@discordjs/voice'
import type { VoiceConnection } from '@discordjs/voice'
import type { Office } from './office.js'
import { selectVoiceChannel } from './voice-policy.js'

export class SpeakingIndicator {
    private connection?: VoiceConnection
    private channelId?: string
    private guild?: Guild
    private retryAt = 0
    private stopped = false
    private heartbeat: ReturnType<typeof setInterval>
    private refresh: ReturnType<typeof setInterval>
    constructor(private office: Office) {
        this.heartbeat = setInterval(() => {
            if (this.connection?.state.status !== VoiceConnectionStatus.Ready) {
                return
            }
            for (const id of this.connection.receiver.speaking.users.keys()) {
                const p = this.office.members.get(id)
                if (p?.voiceChannelId === this.channelId) {
                    this.office.speaking(id, true)
                }
            }
        }, 200)
        this.refresh = setInterval(() => {
            if (this.guild) {
                this.sync(this.guild)
            }
        }, 5000)
        this.heartbeat.unref()
        this.refresh.unref()
    }
    private release() {
        const { connection } = this
        this.connection = undefined
        this.channelId = undefined
        this.office.clearSpeaking()
        if (connection) {
            connection.receiver.speaking.removeAllListeners()
            connection.removeAllListeners()
            if (connection.state.status !== VoiceConnectionStatus.Destroyed) {
                connection.destroy()
            }
        }
    }
    suspend() {
        this.guild = undefined
        this.release()
        if (!this.stopped && this.office.config.discord?.speaking_indicator) {
            this.office.voiceMonitor = {
                state: 'connecting',
                detail: 'Waiting for the Discord connection before monitoring voice.'
            }
        }
    }
    stop() {
        this.stopped = true
        clearInterval(this.heartbeat)
        clearInterval(this.refresh)
        this.release()
    }
    sync(guild: Guild) {
        if (this.stopped) {
            return
        }
        this.guild = guild
        const settings = this.office.config.discord
        if (!settings?.speaking_indicator) {
            this.release()
            this.office.voiceMonitor = { state: 'disabled', detail: 'Speaking indicator is disabled.' }
            return
        }
        const channels = guild.channels.cache.filter((c) => c.type === ChannelType.GuildVoice)
        const desired = selectVoiceChannel(
            [...channels.values()].map((c) => ({
                id: c.id,
                humans: c.isVoiceBased() ? c.members.filter((m) => !m.user.bot).size : 0
            })),
            this.channelId,
            settings.speaking_channel_id ?? '',
            settings.main_general_voice_channel_id
        )
        if (!desired) {
            this.release()
            this.office.voiceMonitor = {
                state: 'idle',
                detail: 'Join a Discord voice channel to show speaking indicators. No audio is sent to the map.'
            }
            return
        }
        const channel = guild.channels.cache.get(desired)
        if (!channel || channel.type !== ChannelType.GuildVoice) {
            return
        }
        if (
            this.channelId === desired &&
            this.connection &&
            this.connection.state.status !== VoiceConnectionStatus.Destroyed &&
            guild.members.me?.voice.channelId === desired
        ) {
            return
        }
        // Keep a connection during its initial handshake, before our bot voice state arrives.
        if (
            this.channelId === desired &&
            this.connection &&
            this.connection.state.status !== VoiceConnectionStatus.Ready &&
            this.connection.state.status !== VoiceConnectionStatus.Destroyed
        ) {
            return
        }
        this.release()
        const identity = { channelId: channel.id, channelName: channel.name }
        if (
            !guild.members.me ||
            !channel
                .permissionsFor(guild.members.me)
                ?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect])
        ) {
            this.office.voiceMonitor = {
                state: 'error',
                ...identity,
                detail: `Give the bot View Channel and Connect permission in ${channel.name} to enable the speaking indicator.`
            }
            return
        }
        if (Date.now() < this.retryAt) {
            return
        }
        this.channelId = channel.id
        this.office.voiceMonitor = {
            state: 'connecting',
            ...identity,
            detail: `Connecting speaking indicator to ${channel.name}…`
        }
        const fail = () => {
            if (this.stopped || this.channelId !== channel.id) {
                return
            }
            this.retryAt = Date.now() + 30_000
            this.release()
            this.office.voiceMonitor = {
                state: 'error',
                ...identity,
                detail: `Could not monitor ${channel.name}. Check voice Connect permission and the server's voice connection. Retrying shortly.`
            }
        }
        try {
            const connection = joinVoiceChannel({
                channelId: channel.id,
                guildId: guild.id,
                adapterCreator: guild.voiceAdapterCreator,
                selfMute: true,
                selfDeaf: false,
                group: 'discord-office-indicator'
            })
            this.connection = connection
            // Do not subscribe to audio streams. SpeakingMap tracks incoming packet
            // activity; no voice decoding, recording, transcription or relay is created.
            let signals = 0
            connection.receiver.speaking.on('start', (id) => {
                if (this.office.members.get(id)?.voiceChannelId !== this.channelId) {
                    return
                }
                this.office.speaking(id, true)
                this.office.voiceMonitor = { ...this.office.voiceMonitor, signals: ++signals }
            })
            connection.receiver.speaking.on('end', (id) => this.office.speaking(id, false))
            connection.on('error', fail)
            connection.on('stateChange', (_, state) => {
                if (this.connection !== connection || this.stopped) {
                    return
                }
                if (state.status === VoiceConnectionStatus.Ready) {
                    this.office.voiceMonitor = {
                        state: 'connected',
                        ...identity,
                        signals,
                        detail: `Speaking indicator: ${channel.name}. One voice channel monitored; no audio in the map.`
                    }
                } else if (state.status === VoiceConnectionStatus.Disconnected) {
                    this.office.clearSpeaking()
                    this.office.voiceMonitor = {
                        state: 'connecting',
                        ...identity,
                        detail: `Reconnecting speaking indicator to ${channel.name}…`
                    }
                }
            })
            void entersState(connection, VoiceConnectionStatus.Ready, 20_000).catch(fail)
        } catch {
            fail()
        }
    }
}
