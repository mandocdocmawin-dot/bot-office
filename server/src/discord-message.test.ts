import { test } from 'vite-plus/test'
import assert from 'node:assert/strict'
import { ChannelType, cleanContent } from 'discord.js'
import type { TextChannel } from 'discord.js'
import { changedMessagePreview, extractMediaContent } from './discord-message.js'
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

test('Discord GIF picker uses the resolved embed, and late embeds replace the share-page preview', () => {
    const page = 'https://tenor.com/view/hello-forrest-gump-test-123456'
    const image = 'https://media.tenor.com/example/tenor.gif'
    const before = { content: page, cleanContent: page, embeds: [] }
    const after = { ...before, embeds: [{ image: { url: image }, url: page }] }
    assert.equal(extractMediaContent(before), page)
    assert.equal(extractMediaContent(after), image)
    assert.equal(changedMessagePreview(before, after), image)
    assert.equal(changedMessagePreview(after, after), undefined)
})

test('GIF picker prefers animated media and supports Discord external image proxies', () => {
    const page = 'https://tenor.com/view/hello-test-987654'
    const proxy = 'https://images-ext-1.discordapp.net/external/signed/https/media.tenor.com/hello/tenor.gif'
    const message = {
        content: page,
        cleanContent: page,
        embeds: [
            {
                thumbnail: { url: 'https://media.tenor.com/hello/tenor.png', proxyURL: proxy },
                video: { url: 'https://media.tenor.com/hello/tenor.mp4' }
            }
        ]
    }
    assert.equal(extractMediaContent(message), proxy)
    assert.equal(changedMessagePreview({ content: page }, message), proxy)
    assert.equal(
        extractMediaContent({ content: 'Hi @friend', cleanContent: 'Hi @Name', embeds: message.embeds }),
        'Hi @Name'
    )
})

test('signed Discord GIF URLs remain intact through the office preview instead of being truncated', () => {
    const bubbles: string[] = []
    const office = new Office(loadConfig(), 'multiplayer', (_id, _room, text) => bubbles.push(text))
    office.upsertDiscord({ id: 'author', username: 'mawin', avatar: null }, 'online')
    const image = `https://cdn.discordapp.com/attachments/123/456/hello.gif?signature=${'a'.repeat(600)}`
    office.discordMessage('author', 'Commons', image)
    assert.equal(bubbles[0], image)
    office.discordMessage(
        'author',
        'Commons',
        `https://cdn.discordapp.com/attachments/123/456/hello.gif?signature=${'a'.repeat(2000)}`
    )
    assert.equal(bubbles.length, 1)
})

test('Klipy picker retains the animated original WebP rather than a flattened Discord thumbnail proxy', () => {
    const page = 'https://klipy.com/gifs/rat-cute-cry'
    const animated = 'https://static.klipy.com/ii/example/animated.webp'
    const proxy = 'https://images-ext-1.discordapp.net/external/hash/https/static.klipy.com/ii/example/animated.webp'
    const message = {
        content: page,
        cleanContent: page,
        embeds: [
            {
                thumbnail: { url: animated, proxyURL: proxy },
                video: { url: 'https://static.klipy.com/ii/example/animation.mp4' }
            }
        ]
    }
    assert.equal(extractMediaContent(message), animated)
    assert.equal(changedMessagePreview({ content: page }, message), animated)
})
