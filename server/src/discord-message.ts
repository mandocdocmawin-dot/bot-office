export interface PreviewMessage {
    content?: string | null
    cleanContent?: string | null
    attachments?: { first?: () => { url: string } | undefined }
    embeds?: Array<{
        image?: { url?: string | null } | null
        thumbnail?: { url?: string | null } | null
        video?: { url?: string | null } | null
        url?: string | null
    }>
}

export function extractMediaContent(message: PreviewMessage): string | undefined {
    if (message.content?.trim()) {
        // discord.js resolves user, nickname, role and channel mentions using
        // the guild cache. Clean before the office truncates the preview.
        return message.cleanContent ?? message.content
    }
    const attachmentUrl = message.attachments?.first?.()?.url
    if (attachmentUrl) {
        return attachmentUrl
    }
    const embed = message.embeds?.[0]
    if (embed) {
        return embed.image?.url || embed.thumbnail?.url || embed.video?.url || embed.url || undefined
    }
    return undefined
}
