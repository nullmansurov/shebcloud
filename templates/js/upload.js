// Функция генерации уникального имени для файла с заданным расширением
function generateUniqueFileNameWithExt(ext) {
  return 'pasted_' + Date.now() + '_' + Math.floor(Math.random() * 1000) + '.' + ext;
}

// Генерация уникального имени для аудиозаписи (по умолчанию .ogg)
function generateUniqueFileName() {
  return 'recording_' + Date.now() + '_' + Math.floor(Math.random() * 1000) + '.ogg';
}

$(document).ready(function() {

  // Обработчик события вставки файлов через Ctrl+V
  $(document).on('paste', function(e) {
    if (!window.currentProject) {
      alert("Выберите проект");
      return;
    }
    var clipboardData = e.originalEvent.clipboardData;
    var foundFile = false;
    if (clipboardData && clipboardData.items) {
      var items = clipboardData.items;
      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        if (item.kind === "file") {
          foundFile = true;
          var file = item.getAsFile();
          var ext = "";
          if (file.name) {
            ext = file.name.split('.').pop().toLowerCase();
          } else {
            if (file.type.indexOf("image/") === 0) {
              ext = "png";
            } else if (file.type.indexOf("audio/") === 0) {
              ext = "ogg";
            } else if (file.type.indexOf("video/") === 0) {
              ext = "mp4";
            }
          }
          var allowedExtensions = ["mp3", "wav", "ogg", "jpg", "jpeg", "png", "gif", "mp4", "webm", "avi", "mov"];
          if (allowedExtensions.indexOf(ext) === -1) {
            alert("Неверный формат файла: " + file.name);
            continue;
          }
          // Генерируем уникальное имя для вставляемого файла
          var uniqueFileName = generateUniqueFileNameWithExt(ext);
          // Создаём новый File с новым именем
          var newFile = new File([file], uniqueFileName, {type: file.type});
          var formData = new FormData();
          formData.append('project_name', window.currentProject);
          formData.append('file', newFile);
          uploadFile(formData);
        }
      }
      if (foundFile) {
        // Предотвращаем стандартное поведение (вставку исходного файла)
        e.preventDefault();
      }
    }
  });

  // Функция загрузки файла с прогресс-баром
  window.uploadFile = function(formData) {
    var progressBar = $('#upload-progress .progress-bar');
    $('#upload-progress').show();
    $.ajax({
      xhr: function() {
        var xhr = new window.XMLHttpRequest();
        xhr.upload.addEventListener("progress", function(evt) {
          if (evt.lengthComputable) {
            var percentComplete = evt.loaded / evt.total * 100;
            progressBar.css('width', percentComplete + '%');
          }
        }, false);
        return xhr;
      },
      url: '/upload_file',
      type: 'POST',
      data: formData,
      processData: false,
      contentType: false,
      success: function(data) {
        $('#upload-progress').fadeOut(500, function(){ progressBar.css('width','0%'); });
        if(data.success) {
          var ext = data.filename.split('.').pop().toLowerCase();
          var fileUrl = "/workspace/" + window.currentProject + "/" + data.filename;
          var tag = "";
          if(["mp3", "wav", "ogg"].indexOf(ext) >= 0) {
            // Вставляем кастомный аудиоплеер с уникальными id
            var existingAudios = $('#editor').find('audio').length;
            var audioId = 'audio' + existingAudios;
            var progressBarId = 'progress-bar' + existingAudios;
            var currentTimeId = 'current-time' + existingAudios;
            var durationId = 'duration' + existingAudios;

            tag = `
            <br>
            <div class="custom-audio-player" contenteditable="false">
              <audio id="${audioId}" preload="metadata" src="${fileUrl}" ontimeupdate="updateProgress('${audioId}', '${progressBarId}', '${currentTimeId}')"></audio>
              <button class="play-btn" onclick="playAudio('${audioId}')">play</button>
              <button class="pause-btn" onclick="pauseAudio('${audioId}')">pause</button>
              <button class="stop-btn" onclick="stopAudio('${audioId}', '${progressBarId}', '${currentTimeId}')">stop</button>
              <div class="progress-container">
                <div class="progress-bar" id="${progressBarId}"></div>
              </div>
              <span class="time" id="${currentTimeId}">0:00</span> / <span class="time" id="${durationId}">0:00</span>
            </div>
            <br>
          `;
            $('#editor').append(tag);
            var audioEl = document.getElementById(audioId);
            audioEl.onloadedmetadata = function() {
              document.getElementById(durationId).textContent = formatTime(audioEl.duration);
            };
          } else if(["jpg", "jpeg", "png", "gif"].indexOf(ext) >= 0) {
            // Встраиваем изображение
            tag = "<br><img src='" + fileUrl + "' style='max-width:100%; display:block; margin:10px auto;' class='resizable draggable'><br>";
            $('#editor').append(tag);
          } else if(["mp4", "webm", "avi", "mov"].indexOf(ext) >= 0) {
            // Встраиваем видео
            tag = "<br><video controls style='max-width:100%; display:block; margin:10px auto;'>" +
                  "<source src='" + fileUrl + "' type='video/" + ext + "'>" +
                  "Ваш браузер не поддерживает видео тег." +
                  "</video><br>";
            $('#editor').append(tag);
          } else {
            tag = "<br><a href='" + fileUrl + "' target='_blank'>" + data.filename + "</a><br>";
            $('#editor').append(tag);
          }
        } else { 
          alert(data.error);
        }
      }
    });
  };

  // Обработчик кнопки загрузки файла
  $('#upload-btn').click(function(){
    $('#upload-file').attr('accept', 'image/*,video/*,audio/*');
    $('#upload-file').click();
  });

  $('#upload-file').attr('multiple', 'multiple');

  $('#upload-file').change(function() {
    if (!window.currentProject) {
      alert("Выберите проект");
      return;
    }
    
    var files = this.files;
    var allowedExtensions = ["mp3", "wav", "ogg", "jpg", "jpeg", "png", "gif", "mp4", "webm", "avi", "mov"];
    
    // Перебираем все выбранные файлы
    Array.from(files).forEach(function(file) {
      var ext = file.name.split('.').pop().toLowerCase();
      if (allowedExtensions.indexOf(ext) === -1) {
        alert("Неверный формат файла: " + file.name);
        return;
      }
      
      var formData = new FormData();
      formData.append('project_name', window.currentProject);
      formData.append('file', file);
      uploadFile(formData);
    });
  });


  // Обновляем состояние при смене проекта (сбрасываем плеер)
  window.resetAudioPlayer = function() {
    if (window.currentPlayingAudio) {
      window.currentPlayingAudio.pause();
      window.currentPlayingAudio.currentTime = 0;
      window.currentPlayingAudio = null;
      window.currentPlayingContainer = null;
      window.currentAudioUrl = null;
      document.querySelector('.floating-audio-controls').style.display = 'none';
    }
  };
  
  // Функция форматирования времени (mm:ss)
  function formatTime(seconds) {
    var minutes = Math.floor(seconds / 60);
    var secs = Math.floor(seconds % 60);
    return minutes + ':' + (secs < 10 ? '0' : '') + secs;
  }
});

// Аудиозапись через MediaRecorder
var mediaRecorder = null;
var audioChunks = [];
$('#record-btn').click(function(){
  if(mediaRecorder === null){
    navigator.mediaDevices.getUserMedia({ audio: true })
    .then(function(stream) {
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];
      mediaRecorder.ondataavailable = function(e){ audioChunks.push(e.data); };
      mediaRecorder.onstop = function(){
        var audioBlob = new Blob(audioChunks, { type: 'audio/ogg; codecs=opus' });
        var fd = new FormData();
        fd.append('project_name', window.currentProject);

        // Генерация уникального имени для записи
        var uniqueFileName = generateUniqueFileName();
        fd.append('file', audioBlob, uniqueFileName);

        uploadFile(fd);
        stream.getTracks().forEach(track => track.stop());
        mediaRecorder = null;
        $('#record-btn').text("Записать аудио");
      };
      mediaRecorder.start();
      $('#record-btn').text("Остановить запись аудио");
    })
    .catch(function(err){
      console.error("Ошибка доступа к микрофону: ", err);
      alert("Нет доступа к микрофону");
    });
  } else {
    mediaRecorder.stop();
  }
});
