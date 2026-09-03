const chat = document.getElementById("chat");
const input = document.getElementById("msg");
const statusEl = document.getElementById("status");
const copyLinkBtn = document.getElementById("copy-link");
const roomNameInput = document.getElementById("room-name");
const sendBtn = document.getElementById("send-btn");

const params = new URLSearchParams(window.location.search);
const room = params.get("room") || "chat-" + Math.random().toString(36).slice(2, 8);

const roomUrl = new URL(window.location.href);
roomUrl.searchParams.set("room", room);
history.replaceState({}, "", roomUrl);
roomNameInput.value = room;

let peer = null;
let dataChannel = null;
let connected = false;

const socket = new WebSocket("wss://signaling.simplewebrtc.com");

function setStatus(text) {
  statusEl.textContent = text;
}

function addMessage(text, isMine = false) {
  const div = document.createElement("div");
  div.className = "msg";
  div.innerText = text;
  if (isMine) {
    div.style.background = "#dff7e4";
    div.style.marginLeft = "auto";
  }
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

function addSystemMessage(text) {
  const div = document.createElement("div");
  div.className = "system";
  div.innerText = text;
  chat.appendChild(div);
}

function setupChannel(channel) {
  if (!channel) return;
  dataChannel = channel;

  channel.onopen = () => {
    connected = true;
    setStatus("Connected - you can chat now");
    addSystemMessage("Connected");
  };

  channel.onclose = () => {
    connected = false;
    setStatus("Connection closed");
  };

  channel.onmessage = (event) => {
    addMessage(event.data, false);
  };
}

function createPeer(initiator) {
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
  });

  if (initiator) {
    dataChannel = pc.createDataChannel("chat");
    setupChannel(dataChannel);
  } else {
    pc.ondatachannel = (event) => {
      setupChannel(event.channel);
    };
  }

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.send(JSON.stringify({
        type: "candidate",
        candidate: event.candidate,
        room
      }));
    }
  };

  return pc;
}

socket.onopen = () => {
  setStatus("Joining room...");
  socket.send(JSON.stringify({ type: "join", room }));
};

socket.onmessage = async (message) => {
  try {
    const data = JSON.parse(message.data);
    if (!data || !data.type) return;

    if (data.type === "ready") {
      if (!peer) {
        peer = createPeer(true);
      }
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      socket.send(JSON.stringify({ type: "offer", offer, room }));
      return;
    }

    if (data.type === "offer") {
      if (!peer) {
        peer = createPeer(false);
      }
      await peer.setRemoteDescription(data.offer);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      socket.send(JSON.stringify({ type: "answer", answer, room }));
      return;
    }

    if (data.type === "answer") {
      if (peer) {
        await peer.setRemoteDescription(data.answer);
      }
      return;
    }

    if (data.type === "candidate") {
      if (peer) {
        try {
          await peer.addIceCandidate(data.candidate);
        } catch (error) {
          console.warn("Candidate skipped:", error);
        }
      }
    }
  } catch (error) {
    console.error("Signal error:", error);
  }
};

socket.onerror = () => {
  setStatus("Could not connect to signaling server");
  addSystemMessage("The browser could not reach the signaling server. Please refresh.");
};

function send() {
  if (!dataChannel || dataChannel.readyState !== "open") {
    setStatus("Waiting for another person to join...");
    return;
  }

  const msg = input.value.trim();
  if (!msg) return;

  dataChannel.send(msg);
  addMessage(msg, true);
  input.value = "";
}

sendBtn.addEventListener("click", send);
input.addEventListener("keydown", (event) => {
  if (event.key === "Enter") send();
});

copyLinkBtn.addEventListener("click", async () => {
  const urlToCopy = window.location.href;
  try {
    await navigator.clipboard.writeText(urlToCopy);
    setStatus("Share link copied");
  } catch {
    setStatus("Copy failed. Please copy the URL manually");
  }
});

addSystemMessage("Share this link with a friend, then open the same room link on their device.");
input.focus();