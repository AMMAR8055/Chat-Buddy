const chat = document.getElementById("chat");
const input = document.getElementById("msg");

// room from URL
const params = new URLSearchParams(window.location.search);
const room = params.get("room") || "default";

// public signaling server (free)
const socket = new WebSocket("wss://signaling.simplewebrtc.com");

let peer;
let dataChannel;

socket.onopen = () => {
  socket.send(JSON.stringify({ type: "join", room }));
};

socket.onmessage = async (msg) => {
  const data = JSON.parse(msg.data);

  if (data.type === "offer") {
    peer = createPeer(false);
    await peer.setRemoteDescription(data.offer);
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);

    socket.send(JSON.stringify({ type: "answer", answer, room }));
  }

  if (data.type === "answer") {
    await peer.setRemoteDescription(data.answer);
  }

  if (data.type === "ready") {
    peer = createPeer(true);
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);

    socket.send(JSON.stringify({ type: "offer", offer, room }));
  }
};

function createPeer(initiator) {
  const pc = new RTCPeerConnection();

  if (initiator) {
    dataChannel = pc.createDataChannel("chat");
    setupChannel();
  } else {
    pc.ondatachannel = (e) => {
      dataChannel = e.channel;
      setupChannel();
    };
  }

  pc.onicecandidate = (e) => {
    if (e.candidate) {
      socket.send(JSON.stringify({
        type: "candidate",
        candidate: e.candidate,
        room
      }));
    }
  };

  socket.onmessage = async (msg) => {
    const data = JSON.parse(msg.data);
    if (data.type === "candidate") {
      await pc.addIceCandidate(data.candidate);
    }
  };

  return pc;
}

function setupChannel() {
  dataChannel.onmessage = (e) => {
    addMessage(e.data);
  };
}

function send() {
  if (!dataChannel) return;

  const msg = input.value;
  dataChannel.send(msg);
  addMessage(msg);
  input.value = "";
}

function addMessage(text) {
  const div = document.createElement("div");
  div.innerText = text;
  chat.appendChild(div);

  // auto delete after 10 sec
  setTimeout(() => {
    div.remove();
  }, 10000);
}