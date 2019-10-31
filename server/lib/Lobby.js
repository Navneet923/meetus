const EventEmitter = require('events').EventEmitter;
const Logger = require('./Logger');
const config = require('../config/config');


const logger = new Logger('Lobby');

class Lobby extends EventEmitter
{
	constructor()
	{
		logger.info('constructor()');

		super();

		// Closed flag.
		this._closed = false;

		this._peers = new Map();
	}

	close()
	{
		logger.info('close()');

		this._closed = true;

		this._peers.forEach((peer) =>
		{
			if (!peer.closed)
				peer.close();
		});

		this._peers.clear();
	}

	checkEmpty()
	{
		logger.info('checkEmpty()');
		
		return this._peers.size === 0;
	}

	peerList()
	{
		logger.info('peerList()');

		return Array.from(this._peers.values()).map((peer) =>
			({
				peerId      : peer.id,
				displayName : peer.displayName 
			}));
	}

	hasPeer(peerId)
	{
		return this._peers.has(peerId);
	}

	promoteAllPeers()
	{
		logger.info('promoteAllPeers()');

		this._peers.forEach((peer) =>
		{
			if (peer.socket)
				this.promotePeer(peer.id);
		});
	}

	promotePeer(peerId)
	{
		logger.info('promotePeer() [peer:"%s"]', peerId);

		const peer = this._peers.get(peerId);

		if (peer)
		{
			this.emit('promotePeer', peer);

			this._peers.delete(peerId);
		}
	}

	parkPeer(peer)
	{
		logger.info('parkPeer() [peer:"%s"]', peer.id);

		if (this._closed)
			return;

		this._notification(peer.socket, 'enteredLobby');

		if (config.requireSignInToAccess && !peer.authenticated && !super.isLocked()) 
			this._notification(peer.socket, 'signInRequired');

		this._peers.set(peer.id, peer);

		peer.on('authenticationChanged', () =>
		{
			logger.info('parkPeer() | authenticationChange [peer:"%s"]', peer.id);

			peer.authenticated && this.emit('peerAuthenticated', peer);
		});

		peer.socket.on('request', (request, cb) =>
		{
			logger.debug(
				'Peer "request" event [method:"%s", peer:"%s"]',
				request.method, peer.id);
			
			if (this._closed)
				return;

			this._handleSocketRequest(peer, request, cb)
				.catch((error) =>
				{
					logger.error('request failed [error:"%o"]', error);

					cb(error);
				});
		});

		peer.on('close', () =>
		{
			logger.debug('Peer "close" event [peer:"%s"]', peer.id);

			if (this._closed)
				return;

			this.emit('peerClosed', peer);

			this._peers.delete(peer.id);

			if (this.checkEmpty())
				this.emit('lobbyEmpty');
		});
	}

	async _handleSocketRequest(peer, request, cb)
	{
		logger.debug(
			'_handleSocketRequest [peer:"%s"], [request:"%s"]',
			peer.id,
			request.method
		);

		if (this._closed)
			return;

		switch (request.method)
		{
			case 'changeDisplayName':
			{
				const { displayName } = request.data;

				peer.displayName = displayName;

				this.emit('changeDisplayName', peer);

				cb();

				break;
			}			
			case 'changePicture':
			{
				const { picture } = request.data;

				peer.picture = picture;

				this.emit('changePicture', peer);

				cb();

				break;
			}
		}
	}

	_notification(socket, method, data = {}, broadcast = false)
	{
		if (broadcast)
		{
			socket.broadcast.to(this._roomId).emit(
				'notification', { method, data }
			);
		}
		else
		{
			socket.emit('notification', { method, data });
		}
	}
}

module.exports = Lobby;