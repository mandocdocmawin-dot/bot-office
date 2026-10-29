import { ChannelType, Client, Events, GatewayIntentBits, Routes } from 'discord.js'
import type { GuildMember } from 'discord.js'
import type { Office } from './office.js'
import { channelKey, textRoom, voiceRoom } from './discord-routing.js'
import type { Member } from './protocol.js'
import { SpeakingIndicator } from './voice.js'
import { extractMediaContent, changedMessagePreview } from './discord-message.js'

const presence = (status?: string): NonNullable<Member['presence']> =>
    status === 'online' || status === 'idle' || status === 'dnd' ? status : 'offline'

export function startDiscord(
    office: Office,
    token: string | undefined,
    guildId: string,
    onMemberLeave: (id: string) => void = () => {}
) {
    const settings = office.config.discord
    if (!settings?.enabled) {
        return () => {}
    }
    if (!token?.trim()) {
        office.discord = {
            state: 'missing_token',
            detail: 'Add DISCORD_TOKEN in the private .env to enable automatic Discord activity.'
        }
        return () => {}
    }
    office.discord = {
        state: 'connecting',
        detail: 'Connecting the Discord bot and loading server members…'
    }
    const intents = [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates
    ]
    if (settings.message_previews) {
        intents.push(GatewayIntentBits.MessageContent)
    }
    const client = new Client({ intents })
    const speaking = new SpeakingIndicator(office)
    const upsert = (m: GuildMember, welcome = false) => {
        if (m.user.bot) {
            return
        }
        office.upsertDiscord(
            {
                id: m.id,
                username: m.displayName,
                avatar: m.displayAvatarURL({ extension: 'png', size: 64 })
            },
            presence(m.presence?.status),
            welcome
        )
    }
    let stopped = false
    const fail = (detail: string) => {
        if (stopped) {
            return
        }
        office.discord = { state: 'error', detail }
        console.error(`Discord activity: ${detail}`)
    }
    client.on(Events.ClientReady, async () => {
        try {
            const guild = await client.guilds.fetch(guildId)
            await guild.channels.fetch()
            // Resolve the actual main voice channel in memory, never overwrite config.
            if (!settings.main_general_voice_channel_id) {
                const general = guild.channels.cache.find(
                    (c) => c.type === ChannelType.GuildVoice && channelKey(c.name) === 'general'
                )
                if (general) {
                    settings.main_general_voice_channel_id = general.id
                }
            }
            const members = await guild.members.fetch({ withPresences: true })
            if (stopped) {
                return
            }
            for (const p of office.members.values()) {
                if (p.source === 'discord' && !members.has(p.id)) {
                    office.forgetDiscordMember(p.id)
                    onMemberLeave(p.id)
                }
            }
            for (const member of members.values()) {
                upsert(member)
                if (!member.user.bot && member.voice.channel) {
                    office.discordVoice(
                        member.id,
                        voiceRoom(office.config, member.voice.channel, member.voice.channel.parent?.name),
                        {
                            channelId: member.voice.channel.id,
                            channelName: member.voice.channel.name,
                            muted: Boolean(member.voice.selfMute || member.voice.serverMute || member.voice.suppress)
                        }
                    )
                }
            }
            office.discord = {
                state: 'connected',
                detail: 'Discord connected. Chat in a channel to move your character automatically.'
            }
            console.log(`Discord activity connected (${office.members.size} characters).`)
            speaking.sync(guild)
        } catch {
            fail(
                'Could not load the server. Invite the bot to GUILD_ID and enable Server Members and Presence intents.'
            )
            client.destroy()
        }
    })
    client.on(Events.MessageCreate, (message) => {
        if (message.guildId !== guildId || message.author.bot || message.webhookId) {
            return
        }
        if (message.member) {
            upsert(message.member)
        }
        const parent = message.channel.isThread() ? message.channel.parent : null
        office.discordMessage(
            message.author.id,
            textRoom(
                office.config,
                { id: message.channelId, name: 'name' in message.channel ? message.channel.name : '' },
                parent
            ),
            settings.message_previews ? extractMediaContent(message) : undefined
        )
    })
    client.on(Events.MessageUpdate, (oldMessage, newMessage) => {
        // Embed updates can be partial and lack an author. Do not dereference
        // author.id in those events: an uncaught error would restart the bot.
        if (newMessage.guildId !== guildId || !newMessage.author || newMessage.author.bot) {
            return
        }
        const newContent = changedMessagePreview(oldMessage, newMessage)
        if (newContent) {
            if (newMessage.member) {
                upsert(newMessage.member)
            }
            const parent = newMessage.channel.isThread() ? newMessage.channel.parent : null
            office.discordMessage(
                newMessage.author.id,
                textRoom(
                    office.config,
                    { id: newMessage.channelId, name: 'name' in newMessage.channel ? newMessage.channel.name : '' },
                    parent
                ),
                settings.message_previews ? newContent : undefined
            )
        }
    })
    client.on(Events.ThreadCreate, async (thread, newlyCreated) => {
        if (thread.guildId !== guildId || !newlyCreated || !thread.ownerId) {
            return
        }
        try {
            const member =
                thread.guild.members.cache.get(thread.ownerId) ?? (await thread.guild.members.fetch(thread.ownerId))
            if (member.user.bot) {
                return
            }
            if (!office.members.has(member.id)) {
                upsert(member)
            }
            office.discordMessage(member.id, textRoom(office.config, thread, thread.parent))
        } catch {
            /* A deleted or inaccessible thread is not replayed as activity. */
        }
    })
    client.on(Events.VoiceStateUpdate, (before, after) => {
        if (after.guild.id !== guildId) {
            return
        }
        if (!after.member?.user.bot) {
            if (after.member && !office.members.has(after.id)) {
                upsert(after.member)
            }
            const voice = after.channel
                ? {
                      channelId: after.channel.id,
                      channelName: after.channel.name,
                      muted: Boolean(after.selfMute || after.serverMute || after.suppress)
                  }
                : null
            if (before.channelId === after.channelId) {
                office.discordVoiceState(after.id, voice)
            } else {
                office.discordVoice(
                    after.id,
                    after.channel ? voiceRoom(office.config, after.channel, after.channel.parent?.name) : null,
                    voice ?? undefined
                )
            }
        }
        speaking.sync(after.guild)
    })
    client.on(Events.PresenceUpdate, (_, value) => {
        if (value.guild?.id !== guildId || value.member?.user.bot) {
            return
        }
        if (!office.members.has(value.userId) && value.member) {
            upsert(value.member)
        }
        office.discordPresence(value.userId, presence(value.status))
    })
    client.on(Events.GuildMemberAdd, (member) => {
        if (member.guild.id === guildId) {
            upsert(member, true)
        }
    })
    client.on(Events.GuildMemberRemove, (member) => {
        if (member.guild.id === guildId) {
            office.forgetDiscordMember(member.id)
            onMemberLeave(member.id)
        }
    })
    client.on(Events.GuildMemberUpdate, (_, member) => {
        if (member.guild.id === guildId) {
            upsert(member)
        }
    })
    client.on(Events.Error, () =>
        fail('Discord connection error. Check the bot token, internet connection and enabled intents.')
    )
    client.on(Events.ShardDisconnect, (event) => {
        speaking.suspend()
        if (event.code === 4014) {
            fail('Enable Server Members, Presence and Message Content intents in Developer Portal → Bot.')
        } else if (!stopped) {
            office.discord = { state: 'connecting', detail: 'Discord disconnected. Reconnecting…' }
        }
    })
    client.on(Events.ShardResume, () => {
        office.discord = {
            state: 'connected',
            detail: 'Discord reconnected. Channel activity moves your character.'
        }
        const guild = client.guilds.cache.get(guildId)
        if (guild) {
            speaking.sync(guild)
        }
    })
    const login = () =>
        client.login(token.trim()).catch((error: unknown) => {
            const description = error instanceof Error ? error.message : ''
            if (/disallowed intents/i.test(description)) {
                fail(
                    'Enable Server Members, Presence and Message Content intents in Developer Portal → Bot, then restart the service (redeploy on Render).'
                )
            } else if (/invalid.*token|token.*invalid/i.test(description)) {
                fail(
                    'Discord rejected the Bot token. Update DISCORD_TOKEN from Developer Portal → Bot in the service environment (.env locally, Environment on Render).'
                )
            } else if (office.discord.state !== 'error') {
                fail('Bot login failed. Check the Bot token, server invitation and enabled intents.')
            }
            client.destroy()
        })
    // Check server membership before requesting privileged gateway intents, so
    // an uninvited bot produces the actionable error instead of a vague login failure.
    client.rest.setToken(token.trim())
    void client.rest
        .get(Routes.guild(guildId))
        .then(() => {
            if (!stopped) {
                return login()
            }
        })
        .catch((error: unknown) => {
            const status = typeof error === 'object' && error !== null && 'status' in error ? error.status : undefined
            if (status === 404 || status === 403) {
                fail(
                    'The bot cannot access GUILD_ID. Verify the server ID, invite the bot belonging to DISCORD_TOKEN to that server, then restart the service (redeploy on Render).'
                )
            } else if (status === 401) {
                fail('Discord rejected DISCORD_TOKEN. Use the current token from Developer Portal → Bot.')
            } else {
                fail('Could not verify the bot server access. Check Discord connectivity and GUILD_ID.')
            }
            client.destroy()
        })
    return () => {
        stopped = true
        speaking.stop()
        client.destroy()
    }
}
