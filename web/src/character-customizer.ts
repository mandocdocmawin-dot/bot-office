import { isCharacterStyle } from '@office/shared/protocol'
import type { CharacterStyle, ClientPacket, Member } from '@office/shared/protocol'
import { characterImage, characterStyles } from './character-styles'

export function createCharacterCustomizer(send: (packet: ClientPacket) => boolean, stopMovement: () => void) {
    const dialog = document.createElement('dialog')
    dialog.id = 'character-dialog'
    dialog.setAttribute('aria-labelledby', 'character-title')
    dialog.innerHTML = `<div class="character-heading"><h2 id="character-title">Make it yours.</h2><button type="button" class="icon-button" aria-label="Close customization">×</button></div>
        <p class="character-intro">Choose your office character. Everyone in the office will see your look.</p>
        <div class="character-options" role="group" aria-label="Character designs"></div>
        <p class="character-note">Concept art shown above. Your map character uses a simplified, animated version.</p>
        <p class="character-feedback" role="status" aria-live="polite"></p>
        <div class="character-actions"><button type="button" class="text-button" data-action="cancel">Cancel</button><button type="button" class="character-save">Save character</button></div>`
    document.body.append(dialog)
    const options = dialog.querySelector<HTMLDivElement>('.character-options')!
    const feedback = dialog.querySelector<HTMLParagraphElement>('.character-feedback')!
    const save = dialog.querySelector<HTMLButtonElement>('.character-save')!
    let selected: CharacterStyle = 'default'
    let self: Member | undefined
    let ready = false
    let restored = false
    let pending: CharacterStyle | undefined
    let timeout: number | undefined
    const storageKey = () => `office-character:${self!.id}`
    const choose = (style: CharacterStyle) => {
        selected = style
        options.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
            button.setAttribute('aria-pressed', String(button.dataset.style === style))
        })
        feedback.textContent = ''
    }
    const finishPending = () => {
        window.clearTimeout(timeout)
        pending = undefined
        save.disabled = false
        save.textContent = 'Save character'
    }
    for (const style of characterStyles) {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'character-option'
        button.dataset.style = style.id
        button.setAttribute('aria-pressed', 'false')
        const image = characterImage(style.id)
        if (image) {
            const img = document.createElement('img')
            img.src = image
            img.alt = `${style.name} concept`
            button.append(img)
        } else {
            const original = document.createElement('div')
            original.className = 'character-original'
            const img = document.createElement('img')
            img.dataset.original = 'true'
            img.alt = 'Your Discord avatar'
            original.append(img)
            button.append(original)
        }
        const label = document.createElement('strong')
        label.textContent = style.name
        const description = document.createElement('span')
        description.textContent = style.description
        button.append(label, description)
        button.onclick = () => {
            if (!pending) {
                choose(style.id)
            }
        }
        options.append(button)
    }
    const close = () => {
        if (!pending) {
            dialog.close()
        }
    }
    dialog.querySelector<HTMLButtonElement>('.icon-button')!.onclick = close
    dialog.querySelector<HTMLButtonElement>('[data-action="cancel"]')!.onclick = close
    dialog.addEventListener('cancel', (event) => {
        if (pending) {
            event.preventDefault()
        }
    })
    dialog.addEventListener('close', () => {
        document.querySelector<HTMLButtonElement>('.customize-self')?.focus()
    })
    save.onclick = () => {
        if (!self || !ready) {
            feedback.textContent = 'Reconnect to the office, then try saving again.'
            return
        }
        if (!send({ type: 'character', style: selected })) {
            feedback.textContent = 'Connection lost. Reconnect and try again.'
            return
        }
        pending = selected
        save.disabled = true
        save.textContent = 'Saving…'
        feedback.textContent = 'Updating your character…'
        timeout = window.setTimeout(() => {
            finishPending()
            feedback.textContent = 'Save was not confirmed. Reconnect and try again.'
        }, 6000)
    }
    return {
        get open() {
            return dialog.open
        },
        show() {
            if (!self || dialog.open) {
                return
            }
            stopMovement()
            choose(self.character ?? 'default')
            const original = dialog.querySelector<HTMLImageElement>('[data-original]')!
            original.src = self.avatar || '/avatars/avatar-default.svg'
            dialog.showModal()
            options.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus()
        },
        disconnected() {
            ready = false
            restored = false
        },
        update(member: Member | undefined, initial: boolean) {
            self = member
            ready = Boolean(member)
            if (!member) {
                return
            }
            if (initial && !restored) {
                restored = true
                try {
                    const saved = localStorage.getItem(storageKey())
                    if (isCharacterStyle(saved) && saved !== (member.character ?? 'default')) {
                        send({ type: 'character', style: saved })
                    }
                } catch {
                    /* Customization still works when browser storage is unavailable. */
                }
            }
            if (pending && member.character === pending) {
                try {
                    localStorage.setItem(storageKey(), pending)
                } catch {
                    /* Keep the live look. */
                }
                finishPending()
                dialog.close()
            }
        }
    }
}
