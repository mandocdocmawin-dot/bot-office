import type { CharacterStyle } from '@office/shared/protocol'

export const characterStyles = [
    { id: 'default', name: 'Discord original', description: 'Your Discord face and original outfit', image: null },
    {
        id: 'blue',
        name: 'Blue Hoodie',
        description: 'Casual hoodie · cyan eyes',
        image: 'option-1.png',
        shirt: 0x39_79_df,
        shell: 0xe4e4f4,
        eyes: 0x50e4ec,
        limbs: 0x282c45,
        shoes: 0xe6e6f3
    },
    {
        id: 'pink',
        name: 'Pink Headset',
        description: 'Mint headset · pink shirt',
        image: 'option-2.png',
        shirt: 0xe58eaf,
        shell: 0xffedcf,
        eyes: 0x7fdeb7,
        limbs: 0x30_32_44,
        shoes: 0xc6aff0
    },
    {
        id: 'mint',
        name: 'Mint Retro',
        description: 'Retro monitor · little antenna',
        image: 'option-3.png',
        shirt: 0x79c9a2,
        shell: 0xffedcf,
        eyes: 0xf6_d7_83,
        limbs: 0x24_4c_4e,
        shoes: 0xffedcf
    },
    {
        id: 'orange',
        name: 'Orange Utility',
        description: 'Utility jacket · cream eyes',
        image: 'option-4.png',
        shirt: 0xf88318,
        shell: 0xf88318,
        eyes: 0xffedcf,
        limbs: 0x30_32_44,
        shoes: 0xffedcf
    },
    {
        id: 'lavender',
        name: 'Lavender Office',
        description: 'Collared shirt · plum tie',
        image: 'option-5.png',
        shirt: 0xb49ae1,
        shell: 0xffedcf,
        eyes: 0xf4accf,
        limbs: 0x48304f,
        shoes: 0xdac9f4
    }
] satisfies {
    id: CharacterStyle
    name: string
    description: string
    image: string | null
    shirt?: number
    shell?: number
    eyes?: number
    limbs?: number
    shoes?: number
}[]

export function characterImage(style: CharacterStyle | undefined) {
    const image = characterStyles.find((item) => item.id === style)?.image
    return image ? `/assets/avatar-concepts/${image}` : null
}

export function robotStyle(style: CharacterStyle | undefined) {
    return characterStyles.find((item) => item.id === style && item.id !== 'default') as
        | { shirt: number; shell: number; eyes: number; limbs: number; shoes: number }
        | undefined
}
