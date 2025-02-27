import type { Node, NodeAPI, NodeDef } from 'node-red';
import type { RefreshingAuthProvider } from '@twurple/auth';
import { ChatClient } from '@twurple/chat';

interface TwitchChatConfig extends NodeDef {
    twitch: string;
    channels: string;
}

interface TwitchConfigNode extends Node {
    twitchEventsub: {
        authProvider: RefreshingAuthProvider;
        node: {
            config: {
                twitch_refresh_token: string;
            };
        };
    };
}

interface TwitchChatPayload {
    channel: string;
    message: string;
}

export default function (RED: NodeAPI) {
    function TwitchChat(this: Node, config: TwitchChatConfig) {
        const node = this;

        RED.nodes.createNode(node, config);
        node.status({ fill: 'grey', shape: 'ring', text: 'Disconnected' });

        (async () => {
            if (!config.twitch || !config.channels) {
                node.error('Missing Twitch configuration');
                return;
            }

            const twitchConfig = RED.nodes.getNode(config.twitch) as TwitchConfigNode;
            if (!twitchConfig) {
                node.error('Invalid Twitch configuration');
                return;
            }

            // Add chat intents to the auth provider
            const refreshToken = twitchConfig.twitchEventsub.node.config.twitch_refresh_token;
            await twitchConfig.twitchEventsub.authProvider.addUserForToken(
                {
                    accessToken: '',
                    refreshToken,
                    expiresIn: null,
                    obtainmentTimestamp: Date.now()
                },
                ['chat']
            );

            // Create a new chat client
            const client = new ChatClient({
                rejoinChannelsOnReconnect: true,
                authProvider: twitchConfig.twitchEventsub.authProvider,
                channels: [config.channels]
            });

            // Connect to Twitch
            client.connect();

            // Handle connection events
            client.onConnect(() => {
                node.status({ fill: 'green', shape: 'dot', text: 'Connected' });
            });

            client.onDisconnect(() => {
                node.status({ fill: 'grey', shape: 'ring', text: 'Disconnected' });
            });

            // Handle incoming messages
            node.on('input', (msg) => {
                // Validate payload
                if (typeof msg.payload !== 'object' || msg.payload === null) {
                    node.error('Payload must be an object');
                    return;
                }
                const payload = msg.payload as TwitchChatPayload;
                if (!payload.channel || !payload.message) {
                    node.error('Missing required fields: channel and message');
                    return;
                }

                // Send message to Twitch
                client
                    .say(payload.channel, payload.message)
                    .then(() => {
                        node.status({ fill: 'green', shape: 'dot', text: 'Message Sent' });
                    })
                    .catch((err) => {
                        node.error('Failed to send message: ' + err.message);
                        node.status({ fill: 'red', shape: 'dot', text: 'Message Failed' });
                    });
            });

            // Clean up on node close
            node.on('close', function (done) {
                client.quit();
                done();
            });
        })();
    }

    TwitchChat.icon = 'twitch-icon.png';
    RED.nodes.registerType('twitch-chat', TwitchChat);
}
