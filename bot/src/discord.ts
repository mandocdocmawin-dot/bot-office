import { Client, Events, GatewayIntentBits, MessageFlags, SlashCommandBuilder, type GuildMember, type VoiceState } from 'discord.js';
import type { Office } from './office.js';
import type { OptOuts } from './optouts.js';
const normalizePresence = (status?: string) => status === 'online' || status === 'idle' || status === 'dnd' ? status : 'offline';
export async function connectDiscord(office: Office, optouts: OptOuts, guildId: string, token: string, webUrl: string) {
  const intents = [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildPresences, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildVoiceStates];
  if (office.config.bubble_enabled) intents.push(GatewayIntentBits.MessageContent);
  const client = new Client({ intents });
  const upsert = (m: GuildMember) => office.add({ id: m.id, username: m.displayName, avatar: m.displayAvatarURL({ extension: 'png', size: 64 }), presence: normalizePresence(m.presence?.status) });
  const voiceRoom = (v: VoiceState) => v.channel ? office.voiceRoom(v.channel.id, v.channel.parent?.name) : null;
  client.on(Events.Error, error => console.error('Discord client error:', error.message));
  client.once(Events.ClientReady, async () => {
    try {
      const guild = await client.guilds.fetch(guildId);
      await guild.channels.fetch();
      const members = await guild.members.fetch({ withPresences: true });
      for (const member of members.values()) {
        upsert(member);
        if (member.voice.channelId) office.voice(member.id, voiceRoom(member.voice));
      }
      const command = new SlashCommandBuilder().setName('office').setDescription('Visit the live Discord office or manage your map privacy')
        .addStringOption(option => option.setName('action').setDescription('Choose optout to hide yourself; optin to reappear')
          .addChoices({ name: 'optout', value: 'optout' }, { name: 'optin', value: 'optin' }));
      // Upsert only our command; never replace the guild's other commands.
      await guild.commands.create(command);
      office.ready = true; office.publish();
      console.log(`Discord connected: ${guild.name}, ${members.size} members. /office registered.`);
    } catch (error) {
      console.error('Discord initialization failed:', error instanceof Error ? error.message : 'Unknown error');
      office.ready = false; office.publish(); client.destroy(); process.exitCode = 1;
    }
  });
  client.on(Events.GuildMemberAdd, member => {
    if (member.guild.id !== guildId) return;
    office.add({ id: member.id, username: member.displayName, avatar: member.displayAvatarURL({ extension: 'png', size: 64 }), presence: normalizePresence(member.presence?.status) }, true);
  });
  client.on(Events.GuildMemberRemove, member => { if (member.guild.id === guildId) office.remove(member.id); });
  client.on(Events.GuildMemberUpdate, (_, member) => { if (member.guild.id === guildId) { upsert(member); office.publish(); } });
  client.on(Events.MessageCreate, message => {
    if (message.guildId !== guildId || message.webhookId) return;
    if (message.member) upsert(message.member);
    office.activity(message.author.id, office.textRoom(message.channelId, message.channel.isThread() ? message.channel.parentId : null), 'message', office.config.bubble_enabled ? message.content : undefined);
  });
  client.on(Events.ThreadCreate, async (thread, newlyCreated) => {
    if (thread.guildId !== guildId || !newlyCreated || !thread.ownerId) return;
    try {
      if (!office.members.has(thread.ownerId)) upsert(await thread.guild.members.fetch(thread.ownerId));
      office.activity(thread.ownerId, office.textRoom(thread.id, thread.parentId), 'thread_create');
    } catch { console.error('Could not resolve thread creator'); }
  });
  client.on(Events.VoiceStateUpdate, (before, after) => {
    if (after.guild.id !== guildId || before.channelId === after.channelId) return;
    if (after.member) upsert(after.member);
    if (before.channelId) office.voice(after.id, null);
    if (after.channelId) office.voice(after.id, voiceRoom(after));
  });
  client.on(Events.PresenceUpdate, (_, presence) => {
    if (presence.guild?.id !== guildId) return;
    if (!office.members.has(presence.userId) && presence.member) upsert(presence.member);
    office.presence(presence.userId, normalizePresence(presence.status));
  });
  client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand() || interaction.commandName !== 'office' || interaction.guildId !== guildId) return;
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const action = interaction.options.getString('action');
      if (action === 'optout' || action === 'optin') {
        await optouts.set(interaction.user.id, action === 'optout');
        office.publish();
        await interaction.editReply(action === 'optout' ? 'You are now hidden from the office map. Use /office action:optin to reappear.' : `You are visible again. Visit the office: ${webUrl}`);
      } else await interaction.editReply(`Visit the office: ${webUrl}\nHide yourself with /office action:optout.`);
    } catch { console.error('Office command failed; check filesystem permissions and Discord connectivity');
      if (interaction.deferred) await interaction.editReply('The office command could not be saved. Please try again.').catch(() => {});
    }
  });
  await client.login(token);
  return () => client.destroy();
}
