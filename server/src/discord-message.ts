import { isMediaUrl, mediaProviderUrl } from './media.js'

interface PreviewImage {
    url?: string | null
    proxyURL?: string | null
}

export interface PreviewMessage {
    content?: string | null
    cleanContent?: string | null
    attachments?: { first?: () => { url: string; contentType?: string | null } | undefined }
    embeds?: Array<{
        image?: PreviewImage | null
        thumbnail?: PreviewImage | null
        video?: { url?: string | null } | null
        url?: string | null
    }>
}

export function extractMediaContent(message: PreviewMessage): string | undefined {
    const attachment = message.attachments?.first?.()
    const images = (message.embeds ?? []).flatMap((embed) => [
        embed.image?.url,
        embed.thumbnail?.url,
        embed.image?.proxyURL,
        embed.thumbnail?.proxyURL
    ])
    const validImages = images.filter(
        (url): url is string =>
            typeof url === 'string' && Boolean(mediaProviderUrl(url)) && /\.(gif|webp|png|jpe?g)(?:\?|$)/i.test(url)
    )
    const directImage = validImages.find((url) => /\.gif(?:\?|$)/i.test(url)) ?? validImages[0]
    if (message.content?.trim()) {
        // Prefer Discord's already-resolved image over fetching a share page
        // again. The embed often arrives in a later MessageUpdate event.
        if (isMediaUrl(message.content.trim()) && directImage) {
            return directImage
        }
        // discord.js resolves user, nickname, role and channel mentions using
        // the guild cache. Clean before the office truncates the preview.
        return message.cleanContent ?? message.content
    }
    const attachmentUrl = attachment?.url
    if (attachmentUrl) {
        return attachmentUrl
    }
    if (directImage) {
        return directImage
    }
    const embed = message.embeds?.[0]
    if (embed) {
        return embed.image?.url || embed.thumbnail?.url || embed.video?.url || embed.url || undefined
    }
    return undefined
}

export function changedMessagePreview(oldMessage: PreviewMessage, newMessage: PreviewMessage): string | undefined {
    const before = extractMediaContent(oldMessage)
    const after = extractMediaContent(newMessage)
    return after && after !== before ? after : undefined
}
