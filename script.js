const video = document.getElementById('video')
const blinkCountInfo = document.getElementById('blinkCountInfo'); // カウント情報を表示する要素


Promise.all([
  faceapi.nets.tinyFaceDetector.loadFromUri('/models'),   //カメラの中の顔を探すmodule
  faceapi.nets.faceLandmark68Net.loadFromUri('/models'),  //目、鼻、口を探すmodule
  faceapi.nets.faceRecognitionNet.loadFromUri('/models'), //顔付きボックス
  faceapi.nets.faceExpressionNet.loadFromUri('/models'),  //表情を判断するmodule
  faceapi.nets.ageGenderNet.loadFromUri("./models"),      //年齢性別を判断するmodule

]).then(startVideo)

function startVideo() {
  navigator.mediaDevices
    .getUserMedia({ video: true })
    .then(function (stream) {
      video.srcObject = stream;
    })
    .catch(function (err) {
      console.error(err);
    });
}

video.addEventListener('play', () => {

  var canvas_bg = document.createElement("canvas");
  canvas_bg.width = video.width;
  canvas_bg.height = video.height;
  document.body.append(canvas_bg)
  var ctx_bg = canvas_bg.getContext('2d');

  var canvas_face = document.createElement("canvas");
  canvas_face.width = video.width;
  canvas_face.height = video.height;
  var ctx_face = canvas_face.getContext('2d');

  const canvas = faceapi.createCanvasFromMedia(video)
  document.body.append(canvas)

  
  const displaySize = { width: video.width, height: video.height }
  faceapi.matchDimensions(canvas, displaySize)
  
  var t1 = performance.now();
  var irisC = [];
  let nowBlinking = false;
  let blinkCount = 0;

  setInterval(async () => {
    const detections = await faceapi
    .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
    .withFaceLandmarks()
    .withFaceExpressions()
    .withAgeAndGender();
    const resizedDetections = faceapi.resizeResults(detections, displaySize)
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
    faceapi.draw.drawDetections(canvas, resizedDetections)
    faceapi.draw.drawFaceLandmarks(canvas, resizedDetections)
    faceapi.draw.drawFaceExpressions(canvas, resizedDetections)

    const landmarks = resizedDetections[0].landmarks;
    const landmarkPositions = landmarks.positions;

    //--- Iric mark ---//
    ctx_bg.clearRect(0, 0, canvas_bg.width, canvas_bg.height)
  
    x_ = landmarkPositions[44-1].x
    y_ = landmarkPositions[44-1].y
    w_ = landmarkPositions[45-1].x - landmarkPositions[44-1].x
    h_ = landmarkPositions[48-1].y - landmarkPositions[44-1].y
    ctx_bg.fillRect(x_, y_, w_, h_)

    //--- Iris value ---//
    ctx_face.clearRect(0, 0, canvas_face.width, canvas_face.height)
    ctx_face.drawImage(video, 0, 0, video.width, video.height);
    var frame = ctx_face.getImageData(0, 0, video.width, video.height);
    var p_ = Math.floor(x_+w_/2) + Math.floor(y_+h_/2) * video.width
    var v_ = Math.floor( (frame.data[p_*4+0] + frame.data[p_*4+1] + frame.data[p_*4+2])/3 );
    console.log("irisC:"+v_);

    irisC.push(v_);
    if(irisC.length>100){
        irisC.shift();
    }

    let meanIrisC = irisC.reduce(function(sum, element){
      return sum + element;
    }, 0);
    meanIrisC = meanIrisC / irisC.length;
    let vThreshold = 1.3;

    let currentIrisC = irisC[irisC.length-1];
    if(irisC.length==100){
       if(nowBlinking==false){
          if(currentIrisC>=meanIrisC*vThreshold){
              nowBlinking = true;
          }
       }
       else{
          if(currentIrisC<meanIrisC*vThreshold){
              nowBlinking = false;
              blinkCount += 1;
          }
       }
    }


    var ctx = canvas.getContext('2d');

    var t2 = performance.now();
    ctx.fillStyle = 'black';
    ctx.font = "48px serif";
    ctx.fillText("まばたき:"+blinkCount+"回", 10, 100);
    t1 = t2;


      // Pythonにデータを送信
      const blinkData = {

        blinkCount: blinkCount,   // まばたき数
       
      };

      fetch('/receive_blink_count', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(blinkData),
      });

    });
  }, 100);
  
  // サーバーから瞬きカウントを取得する関数を定義
  function getBlinkCount() {
    fetch('/get_blink_count')
      .then(response => response.json())
      .then(data => {
        blinkCount = data.blinkCount;
      
        console.log("blinkCount:", blinkCount);

      })
      .catch(error => {
        console.error('エラー:', error);
      });
  }
  // 一定の間隔でgetBlinkCountを呼び出す
  setInterval(getBlinkCount, 1000); // 1000ミリ秒(1秒)ごとに呼び出す例
  
//});

// 【☆注意！☆】
// faceapi.jsはまばたき数を検知するものではないのでこちらのプログラムは目の位置座標から
// 黒目の中心付近のRGB値を毎フレームごとに取って、目が開いている状態→黒目、閉じている状態→まぶたの色を得ています。
// これにより目の開閉を判別しています。動作がやや重めです。
// 僕が何回か試したところ、実行してからすぐは動きがカクカクです。10秒ほど待つと瞬きがカウントされ始めると思います。