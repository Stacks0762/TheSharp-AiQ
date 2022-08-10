const axios = require("axios");
const mqtt = require("mqtt");

var access_token = "";

//////////////////  TheSharp settings   //////////////////
const userId = "qwerty1234"; //더샵 AiQ 로그인 ID
const password = "qwerty1234"; //더샵 AiQ 로그인 비밀번호
const phone_uid = "AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA"; //더샵 AiQ앱 스마트폰 UUID
const complex_code = "qwertyuiopasdfghjkl"; //더샵 아파트 코드
const newInterval = 30000;//기기 상태들을 확인하는 시간 간격(30000 = 30초)
const basic_token =
  "Basic AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"; //앱의 패킷중, 로그인하는 패킷에 들어있는 데이터중 Authorization에 있습니다
const mqttIP = "mqtt://0.0.0.0"; //MQTT IP
const mqttPORT = 1883; //MQTT 포트
const mqttClientID = "TheSharp-AIQHome"; //MQTT 클라이언트 ID(아무거나 해도 됩니다)
const updateStateID = "AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA";//앱의 패킷중, 제어하는 패킷에 들어있는 데이터중 ID라는 값에 있습니다
const getNewStateID = "AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA";//앱의 패킷중, 기기들의 상태를 확인하는 패킷에 들어있는 데이터중 ID라는 값에 있습니다
var DeviceIds = {
  light: {
    livingRoom1: {
      thingsId: "AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA",
      state: false,
    }
  },
};
/*
각 디바이스들의 이름과 기기들의 UUID
이 형식을 맞춰 주셔야 합니다.
var DeviceIds = {
    light: {
        (각 방의 이름): {
            thingsId: (기기의 UUID)
            state: false
        }
    }
}
괄호 안에 있는 값은 앱의 패킷을 추출해서 데이터를 넣으시면 됩니다.
(온도조절기, 대기전력, 엘리베이터의 경우 곧 만들겠습니다.)
*/
//////////////////////////////////////////////////////////
var log = (...args) =>
  console.log(
    "[" + new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) + "]",
    args.join(" ")
  );
var ThingsList = {};
const client = mqtt.connect(mqttIP, {
  clientId: mqttClientID,
  port: mqttPORT,
});
client.on("connect", () => {
  log("MQTT service connected!");
  client.subscribe("aiqhome/+/+/command", (err) => {
    if (err) log("MQTT Subscribe fail! -", "aiqhome");
  });
});
client.on("message", (topic, message) => {
  var commands = topic.toString().split("/");
  switch (commands[1]) {
    case "light":
      updateState(commands[1], commands[2], message.toString());
  }
});

function getToken(callback) {
  var newform = new URLSearchParams();
  newform.append("grant_type", "password");
  newform.append("username", userId);
  newform.append("complex_code", complex_code);
  newform.append("phone_uid", phone_uid);
  newform.append("password", password);
  axios
    .post("https://cordoba-api.postown.net/api/v1/oauth2/token", newform, {
      headers: {
        Authorization: basic_token,
      },
    })
    .then((res) => {
      log("The new token : {", res.data.access_token.toString(), "}");
      log(`The token will be expired after ${res.data.expires_in}s`);
      callback(res.data);
    })
    .catch((error) => {
      log(error);
      callback(null);
    });
}

function updateState(kind, where, state) {
  axios
    .post(
      "https://cordoba-api.postown.net/api/v1/mobile",
      {
        id: updateStateID,
        type: "ThingsUpdateState",
        version: "1",
        phoneUid: phone_uid,
        body: {
          thingsId: DeviceIds[kind][where].thingsId,
          capabilityName: "Power",
          desired: { power: state.toString() },
        },
      },
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      }
    )
    .then((res1) => {
      log(`${kind} in ${where} is ${state.toString()}`);
      client.publish(`aiqhome/${kind}/${where}/state`, state.toString());
    })
    .catch((error) => {
      log(error);
    });
}

function getNewState() {
  axios
    .post(
      "https://cordoba-api.postown.net/api/v1/mobile",
      {
        id: getNewStateID,
        type: "ThingsList",
        version: "1",
        phoneUid: phone_uid,
      },
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      }
    )
    .then((res1) => {
      ThingsList = JSON.parse(JSON.stringify(res1.data.body));
      for (var i = 0; i < Object.keys(DeviceIds["light"]).length; i++) {
        DeviceIds["light"][Object.keys(DeviceIds["light"])[i]].state =
          ThingsList[
            DeviceIds["light"][Object.keys(DeviceIds["light"])[i]].thingsId
          ].state.power.toString() == "on";
        client.publish(
          `aiqhome/light/${Object.keys(DeviceIds["light"])[i]}/state`,
          ThingsList[
            DeviceIds["light"][Object.keys(DeviceIds["light"])[i]].thingsId
          ].state.power.toString()
        );
      }
    })
    .catch((error) => {
      log(error);
    });
}

getToken((res) => {
  if (res != null) {
    access_token = res.access_token;
    getNewState();
  }
});
setInterval(() => {
  getNewState();
  log("New data was sended.");
}, 30000);
