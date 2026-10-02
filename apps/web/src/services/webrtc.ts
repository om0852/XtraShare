import { DEFAULT_ICE_SERVERS, SignalPacket, TransportMode } from '@xtrashare/protocol';
import { socketService } from './socket.js';
import { useDeviceStore } from '../store/deviceStore.js';

export class PeerConnectionManager {
  private connections = new Map<string, RTCPeerConnection>();
  private dataChannels = new Map<string, RTCDataChannel>();
  private makingOffer = new Map<string, boolean>();
  private messageListeners = new Set<(peerId: string, data: string | ArrayBuffer) => void>();
  private stateListeners = new Set<(peerId: string, state: RTCPeerConnectionState) => void>();

  constructor() {
    socketService.onSignal((packet) => this.handleSignal(packet));
    socketService.onPeerLeave((deviceId) => {
      this.closeConnection(deviceId);
    });
  }

  /**
   * Returns or establishes a WebRTC connection with a peer.
   */
  public ensureConnection(peerId: string): RTCPeerConnection {
    let pc = this.connections.get(peerId);
    if (!pc || pc.connectionState === 'closed' || pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
      if (pc) {
        try {
          pc.close();
        } catch {}
      }
      pc = this.createPeerConnection(peerId);
      this.connections.set(peerId, pc);

      // Create outbound data channel
      const channel = pc.createDataChannel('xtrashare-data', {
        ordered: true
      });
      this.setupDataChannel(peerId, channel);
    } else {
      // Re-create data channel if missing or closed on an active connection
      const existingChannel = this.dataChannels.get(peerId);
      if (!existingChannel || existingChannel.readyState === 'closed') {
        try {
          const channel = pc.createDataChannel('xtrashare-data', { ordered: true });
          this.setupDataChannel(peerId, channel);
        } catch (e) {
          console.warn('Could not re-create DataChannel on existing pc:', e);
        }
      }
    }
    return pc;
  }

  private createPeerConnection(peerId: string): RTCPeerConnection {
    const pc = new RTCPeerConnection({
      iceServers: DEFAULT_ICE_SERVERS
    });

    // Determine polite role: peer with lexicographically smaller ID is polite
    const selfId = useDeviceStore.getState().selfDevice?.id || '';

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketService.sendSignal({
          type: 'ice-candidate',
          from: selfId,
          to: peerId,
          payload: event.candidate.toJSON()
        });
      }
    };

    // Negotiation needed handler (glare-safe polite peer pattern)
    pc.onnegotiationneeded = async () => {
      try {
        this.makingOffer.set(peerId, true);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        socketService.sendSignal({
          type: 'offer',
          from: selfId,
          to: peerId,
          payload: pc.localDescription
        });
      } catch (err) {
        console.error('Error creating offer for peer:', peerId, err);
      } finally {
        this.makingOffer.set(peerId, false);
      }
    };

    // Incoming DataChannel listener
    pc.ondatachannel = (event) => {
      this.setupDataChannel(peerId, event.channel);
    };

    pc.onconnectionstatechange = () => {
      console.log(`WebRTC state with ${peerId}: ${pc.connectionState}`);
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        this.dataChannels.delete(peerId);
      }
      for (const listener of this.stateListeners) {
        listener(peerId, pc.connectionState);
      }
    };

    return pc;
  }

  private setupDataChannel(peerId: string, channel: RTCDataChannel): void {
    channel.binaryType = 'arraybuffer';

    channel.onopen = () => {
      console.log(`RTCDataChannel opened with peer ${peerId}`);
      this.dataChannels.set(peerId, channel);
    };

    channel.onclose = () => {
      console.log(`RTCDataChannel closed with peer ${peerId}`);
      this.dataChannels.delete(peerId);
    };

    channel.onerror = (err) => {
      console.error(`RTCDataChannel error with peer ${peerId}:`, err);
    };

    channel.onmessage = (event) => {
      for (const listener of this.messageListeners) {
        listener(peerId, event.data);
      }
    };

    this.dataChannels.set(peerId, channel);
  }

  private async handleSignal(packet: SignalPacket): Promise<void> {
    const peerId = packet.from;
    const selfId = useDeviceStore.getState().selfDevice?.id || '';
    const isPolite = selfId < peerId;

    let pc = this.connections.get(peerId);
    if (!pc) {
      pc = this.createPeerConnection(peerId);
      this.connections.set(peerId, pc);
    }

    try {
      if (packet.type === 'offer') {
        const offerCollision =
          this.makingOffer.get(peerId) || pc.signalingState !== 'stable';

        if (offerCollision && !isPolite) {
          // Ignore collision offer if we are impolite
          return;
        }

        await pc.setRemoteDescription(new RTCSessionDescription(packet.payload));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socketService.sendSignal({
          type: 'answer',
          from: selfId,
          to: peerId,
          payload: pc.localDescription
        });
      } else if (packet.type === 'answer') {
        await pc.setRemoteDescription(new RTCSessionDescription(packet.payload));
      } else if (packet.type === 'ice-candidate') {
        if (packet.payload) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(packet.payload));
          } catch (e) {
            console.warn('Failed to add received ICE candidate:', e);
          }
        }
      }
    } catch (err) {
      console.error('Signaling handling error with peer:', peerId, err);
    }
  }

  public async getTransportMode(peerId: string): Promise<TransportMode> {
    const pc = this.connections.get(peerId);
    if (!pc) return 'websocket-relay';

    try {
      const stats = await pc.getStats();
      for (const report of stats.values()) {
        if (report.type === 'candidate-pair' && (report.nominated || report.state === 'succeeded')) {
          const localCandidate = stats.get(report.localCandidateId);
          if (localCandidate) {
            const candidateType = localCandidate.candidateType;
            if (candidateType === 'host') return 'lan-p2p';
            if (candidateType === 'srflx' || candidateType === 'prflx') return 'webrtc-p2p';
            if (candidateType === 'relay') return 'turn-relay';
          }
        }
      }
    } catch {
      // ignore stat errors
    }

    const channel = this.getDataChannel(peerId);
    if (channel && channel.readyState === 'open') {
      return 'webrtc-p2p';
    }
    return 'websocket-relay';
  }

  public getDataChannel(peerId: string): RTCDataChannel | undefined {
    return this.dataChannels.get(peerId);
  }

  public async sendData(peerId: string, data: string | ArrayBuffer): Promise<boolean> {
    const channel = this.getDataChannel(peerId);
    if (channel && channel.readyState === 'open') {
      channel.send(data as any);
      return true;
    }
    return false;
  }

  public onMessage(listener: (peerId: string, data: string | ArrayBuffer) => void): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  public onStateChange(listener: (peerId: string, state: RTCPeerConnectionState) => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  public closeConnection(peerId: string): void {
    const pc = this.connections.get(peerId);
    if (pc) {
      pc.close();
      this.connections.delete(peerId);
    }
    this.dataChannels.delete(peerId);
  }
}

export const peerConnectionManager = new PeerConnectionManager();
