import { test } from 'vite-plus/test'
import assert from 'node:assert/strict'
import { ChannelType, cleanContent } from 'discord.js'
import type { TextChannel } from 'discord.js'
import { extractMediaContent } from './discord-message.js'
import { loadConfig } from './config.js'
import { Office } from './office.js'

test('Discord user, nickname, role and channel mentions become readable preview text', () => {
    const id = '903170305643226207'
    const channel = {
        type: ChannelType.GuildText,
        guild: {
            members: { cache: new Map([[id, { displayName: 'IMO「イモ」' }]]) },
            roles: { cache: new Map([['903170305643226208', { name: 'Study Group' }]]) }
        },
        client: {
            users: { cache: new Map() },
            channels: { cache: new Map([['903170305643226209', { name: 'general' }]]) }
        }
    } as unknown as TextChannel
    for (const raw of [`<@${id}>`, `<@!${id}>`]) {
        const preview = extractMediaContent({ content: raw, cleanContent: cleanContent(raw, channel) })
        assert.equal(preview, '@IMO「イモ」')
    }
    const raw = '<@&903170305643226208> meet in <#903170305643226209>'
    assert.equal(
        extractMediaContent({ content: raw, cleanContent: cleanContent(raw, channel) }),
        '@Study Group meet in #general'
    )
})

test('resolved mention reaches the transient bubble before preview truncation', () => {
    const bubbles: string[] = []
    const office = new Office(loadConfig(), 'multiplayer', (_id, _room, text) => bubbles.push(text))
    office.upsertDiscord({ id: 'author', username: 'mawin', avatar: null }, 'online')
    const preview = extractMediaContent({
        content: '<@903170305643226207> hello!',
        cleanContent: '@IMO「イモ」 hello!'
    })
    office.discordMessage('author', 'Commons', preview)
    assert.equal(bubbles[0], '@IMO「イモ」 hello!')
    assert.ok(!JSON.stringify(office.snapshot()).includes('hello!'))
})

test('plain text, GIF links, attachments and late embeds retain their preview content', () => {
    const gif = 'https://giphy.com/gifs/link-the-legend-of-zelda-NVBR6cLvUjV9C'
    assert.equal(extractMediaContent({ content: gif, cleanContent: gif }), gif)
    assert.equal(extractMediaContent({ content: 'hello' }), 'hello')
    assert.equal(
        extractMediaContent({ content: null, attachments: { first: () => ({ url: 'https://example.com/a.gif' }) } }),
        'https://example.com/a.gif'
    )
    assert.equal(
        extractMediaContent({ embeds: [{ image: { url: 'https://example.com/b.gif' } }] }),
        'https://example.com/b.gif'
    )
    assert.equal(extractMediaContent({}), undefined)
})
