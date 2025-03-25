$(document).ready(function () {
  let currentFacing = "user"; // По умолчанию передняя камера
  let currentStream = null;
  let video = document.getElementById("video-preview");

  function stopCurrentStream() {
    if (currentStream) {
      currentStream.getTracks().forEach(track => track.stop());
    }
  }

  function startCamera(facingMode) {
    stopCurrentStream();

    let constraints = { video: { facingMode: facingMode } };

    navigator.mediaDevices
      .getUserMedia(constraints)
      .then(function (stream) {
        currentStream = stream;
        video.srcObject = stream;
        currentFacing = facingMode;

        // Проверяем, доступна ли задняя камера
        navigator.mediaDevices.enumerateDevices().then(devices => {
          let videoDevices = devices.filter(device => device.kind === "videoinput");
          if (videoDevices.length > 1) {
            $("#flip-camera-btn").show();
          } else {
            $("#flip-camera-btn").hide();
          }
        });
      })
      .catch(function (err) {
        console.error("Ошибка доступа к камере: ", err);
        alert("Нет доступа к камере");
      });
  }

  // Открытие камеры
  $("#photo-btn").click(function () {
    if (!window.currentProject) {
      alert("Выберите проект");
      return;
    }
    $("#camera-modal").fadeIn(200);
    startCamera("user");
  });

  // Переключение камеры
  $("#flip-camera-btn").click(function () {
    let newFacing = currentFacing === "user" ? "environment" : "user";
    startCamera(newFacing);
  });


  // Генерация уникального имени для файла
  function generateUniqueFileName() {
    return 'recording_' + Date.now() + '_' + Math.floor(Math.random() * 1000) + '.png';
  }


  // Захват снимка
  $("#capture-btn").click(function () {
    let canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    let ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(function (blob) {
      if (confirm("Загрузить этот снимок?")) {
        let fd = new FormData();
        fd.append("project_name", window.currentProject);

        var uniqueFileName = generateUniqueFileName();
        fd.append("file", blob, uniqueFileName);

        // Используем глобальную функцию uploadFile (определённую в upload.js)
        uploadFile(fd);
      }
    }, "image/png");

    stopCurrentStream();
    $("#camera-modal").fadeOut(200);
  });

  // Отмена съемки
  $("#cancel-capture-btn").click(function () {
    stopCurrentStream();
    $("#camera-modal").fadeOut(200);
  });
});
