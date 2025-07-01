const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

// Initialize Express app
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Initialize Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Bot ready event
client.once('ready', () => {
  console.log(`✅ CV Alert Bot is online as ${client.user.tag}`);
  console.log(`🚀 Bot ID: ${client.user.id}`);
  console.log(`📡 Servers: ${client.guilds.cache.size}`);
});

// Error handling
client.on('error', error => {
  console.error('❌ Discord client error:', error);
});

process.on('unhandledRejection', error => {
  console.error('❌ Unhandled promise rejection:', error);
});

// API Routes

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    bot_status: client.isReady() ? 'online' : 'offline',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Main alerts endpoint
app.post('/api/alerts', async (req, res) => {
  try {
    const { channel_id, payload, message_type, source } = req.body;

    // Validate required fields
    if (!channel_id) {
      return res.status(400).json({ error: 'channel_id is required' });
    }

    if (!payload) {
      return res.status(400).json({ error: 'payload is required' });
    }

    // Validate bot is ready
    if (!client.isReady()) {
      return res.status(503).json({ error: 'Bot is not ready' });
    }

    // Get Discord channel
    const channel = await client.channels.fetch(channel_id);
    
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    // Prepare message options
    const messageOptions = {};

    // Add content if provided
    if (payload.content) {
      messageOptions.content = payload.content;
    }

    // Add embeds if provided
    if (payload.embeds && Array.isArray(payload.embeds)) {
      messageOptions.embeds = payload.embeds.map(embedData => {
        const embed = new EmbedBuilder();
        
        if (embedData.title) embed.setTitle(embedData.title);
        if (embedData.description) embed.setDescription(embedData.description);
        if (embedData.color) embed.setColor(embedData.color);
        if (embedData.timestamp) embed.setTimestamp(new Date(embedData.timestamp));
        
        if (embedData.footer) {
          embed.setFooter({ text: embedData.footer.text });
        }
        
        if (embedData.fields && Array.isArray(embedData.fields)) {
          embedData.fields.forEach(field => {
            embed.addFields({
              name: field.name,
              value: field.value,
              inline: field.inline || false
            });
          });
        }
        
        return embed;
      });
    }

    // Send message to Discord
    const sentMessage = await channel.send(messageOptions);

    // Add reactions for critical alerts
    if (message_type === 'CRITICAL_ALERT') {
      await sentMessage.react('🚨');
      await sentMessage.react('👀');
    } else if (message_type === 'HIGH_PRIORITY_ALERT') {
      await sentMessage.react('⚠️');
    } else if (message_type === 'HEALTHY_STATUS') {
      await sentMessage.react('✅');
    }

    // Log successful send
    console.log(`📤 Alert sent: ${message_type} to channel ${channel_id}`);

    res.json({
      success: true,
      message_id: sentMessage.id,
      channel_id: channel_id,
      message_type: message_type,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error sending alert:', error);
    
    // Determine error type for better response
    if (error.code === 10003) {
      res.status(404).json({ error: 'Channel not found' });
    } else if (error.code === 50013) {
      res.status(403).json({ error: 'Missing permissions' });
    } else if (error.code === 50035) {
      res.status(400).json({ error: 'Invalid form body' });
    } else {
      res.status(500).json({ 
        error: 'Internal server error',
        details: error.message 
      });
    }
  }
});

// Test endpoint for development
app.post('/api/test', async (req, res) => {
  try {
    const { channel_id, message } = req.body;
    
    const channel = await client.channels.fetch(channel_id);
    const sentMessage = await channel.send(message || '🧪 Test message from CV Alert Bot');
    
    res.json({
      success: true,
      message_id: sentMessage.id,
      test: true
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get bot info
app.get('/api/info', (req, res) => {
  if (!client.isReady()) {
    return res.status(503).json({ error: 'Bot not ready' });
  }

  res.json({
    bot_id: client.user.id,
    bot_username: client.user.username,
    bot_tag: client.user.tag,
    guild_count: client.guilds.cache.size,
    online: true,
    uptime_seconds: Math.floor(process.uptime())
  });
});

// Start Express server
app.listen(port, () => {
  console.log(`🌐 CV Alert Bot API listening on port ${port}`);
});

// Login to Discord
const DISCORD_TOKEN = process.env.DISCORD_BOT_TOKEN;

if (!DISCORD_TOKEN) {
  console.error('❌ DISCORD_BOT_TOKEN environment variable is required');
  process.exit(1);
}

client.login(DISCORD_TOKEN).catch(error => {
  console.error('❌ Failed to login to Discord:', error);
  process.exit(1);
});
