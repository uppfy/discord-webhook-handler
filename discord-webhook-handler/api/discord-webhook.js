import { verifyKey } from 'discord-interactions';
import axios from 'axios';

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get Discord signature headers
    const signature = req.headers['x-signature-ed25519'];
    const timestamp = req.headers['x-signature-timestamp'];
    const body = JSON.stringify(req.body);

    // Verify the request is from Discord
    const isValidRequest = verifyKey(
      body, 
      signature, 
      timestamp, 
      process.env.DISCORD_PUBLIC_KEY
    );
    
    if (!isValidRequest) {
      console.log('Invalid Discord signature');
      return res.status(401).json({ error: 'Bad request signature' });
    }

    const { type, data, member, user } = req.body;
    
    // Handle Discord ping (required for initial setup)
    if (type === 1) {
      console.log('Discord ping received');
      return res.json({ type: 1 });
    }
    
    // Handle button interactions
    if (type === 3) {
      const customId = data.custom_id;
      const interactionUser = member?.user || user;
      const userId = interactionUser?.id;
      const username = interactionUser?.username;
      
      console.log(`Button clicked: ${customId} by ${username} (${userId})`);
      
      // Send response to n8n webhook
      try {
        await axios.post(process.env.N8N_WEBHOOK_URL, {
          action: customId,
          userId: userId,
          username: username,
          timestamp: new Date().toISOString(),
          interactionId: req.body.id
        }, {
          timeout: 5000,
          headers: {
            'Content-Type': 'application/json'
          }
        });
        
        console.log('Successfully sent data to n8n');
      } catch (error) {
        console.error('Error sending to n8n:', error.message);
        // Continue anyway to respond to Discord
      }
      
      // Respond to Discord interaction
      const isApproval = customId === 'approve_script';
      return res.json({
        type: 4,
        data: {
          content: `${isApproval ? '✅ Approved' : '❌ Rejected'} by ${username}`,
          flags: 64 // Ephemeral message (only visible to the user who clicked)
        }
      });
    }
    
    // Handle other interaction types
    console.log('Unhandled interaction type:', type);
    return res.status(400).json({ error: 'Unhandled interaction type' });
    
  } catch (error) {
    console.error('Error processing Discord interaction:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}