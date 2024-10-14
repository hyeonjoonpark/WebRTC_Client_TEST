// src/App.js
import React, { useEffect, useState, useRef } from 'react';
import SockJS from 'sockjs-client';
import { Client } from '@stomp/stompjs'; // stompjs 대신 @stomp/stompjs를 사용합니다.

const App = () => {
    const [messages, setMessages] = useState([]);
    const [stompClient, setStompClient] = useState(null);
    const localVideoRef = useRef(null);
    const remoteVideoRef = useRef(null);
    const peerConnection = useRef(new RTCPeerConnection());

    useEffect(() => {
        const socket = new SockJS('http://localhost:8080/chat');
        const client = new Client({
            webSocketFactory: () => socket,
            onConnect: (frame) => {
                setStompClient(client);
                client.subscribe('/topic/messages', (message) => {
                    setMessages((prev) => [...prev, message.body]);
                });
                client.subscribe('/topic/ice-candidates', (message) => {
                    const signal = JSON.parse(message.body);
                    if (signal.type === 'ice-candidate') {
                        peerConnection.current.addIceCandidate(new RTCIceCandidate(signal.candidate));
                    } else if (signal.type === 'offer') {
                        handleOffer(signal.offer);
                    } else if (signal.type === 'answer') {
                        peerConnection.current.setRemoteDescription(new RTCSessionDescription(signal.answer));
                    }
                });
            },
        });

        client.activate();

        return () => {
            client.deactivate();
        };
    }, []);

    useEffect(() => {
        peerConnection.current.onicecandidate = (event) => {
            if (event.candidate) {
                sendSignal({ type: 'ice-candidate', candidate: event.candidate });
            }
        };

        peerConnection.current.ontrack = (event) => {
            remoteVideoRef.current.srcObject = event.streams[0];
        };
    }, []);

    const startVideoCall = async () => {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideoRef.current.srcObject = stream;

        stream.getTracks().forEach(track => {
            peerConnection.current.addTrack(track, stream);
        });

        const offer = await peerConnection.current.createOffer();
        await peerConnection.current.setLocalDescription(offer);

        sendSignal({ type: 'offer', offer });
    };

    const handleOffer = async (offer) => {
        await peerConnection.current.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.current.createAnswer();
        await peerConnection.current.setLocalDescription(answer);
        sendSignal({ type: 'answer', answer });
    };

    const sendSignal = (signal) => {
        if (stompClient) {
            stompClient.publish({ destination: '/app/send', body: JSON.stringify(signal) });
        }
    };

    const sendMessage = (message) => {
        if (stompClient) {
            stompClient.publish({ destination: '/app/send', body: message });
        }
    };

    return (
        <div>
            <h1>Video Chat</h1>
            <button onClick={startVideoCall}>Start Video Call</button>
            <div>
                <h2>Messages</h2>
                <ul>
                    {messages.map((msg, index) => (
                        <li key={index}>{msg}</li>
                    ))}
                </ul>
            </div>
            <div>
                <video autoPlay ref={localVideoRef} style={{ width: '300px' }} />
                <video autoPlay ref={remoteVideoRef} style={{ width: '300px' }} />
            </div>
        </div>
    );
};

export default App;
