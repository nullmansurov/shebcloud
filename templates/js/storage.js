$(document).ready(function() {
    // Убрана функция openProjectFolder, так как возможность открытия папки проекта отключена

    // Функция для открытия модального окна «Хранилище»
    function openStorageModal() {
        if (!window.currentProject) {
            alert("Выберите проект");
            return;
        }
        // Запрашиваем список файлов для текущего проекта
        $.ajax({
            url: '/storage_api',
            type: 'GET',
            data: { project_name: window.currentProject },
            success: function(response) {
                if (response.success) {
                    var modalHtml = '<div id="storage-modal-overlay"></div>';
                    modalHtml += '<div id="storage-modal">';
                    modalHtml += '<div id="storage-modal-header"><h3>Хранилище файлов</h3><button id="storage-modal-close">&times;</button></div>';
                    modalHtml += '<div id="storage-modal-body">';
                    if (response.files.length === 0) {
                        modalHtml += '<p>Файлы не найдены.</p>';
                    } else {
                        modalHtml += '<table id="storage-file-table"><thead><tr><th><input type="checkbox" id="select-all-files"></th><th>Имя файла</th><th>Действия</th></tr></thead><tbody>';
                        $.each(response.files, function(index, filename) {
                            var ext = filename.split('.').pop().toLowerCase();
                            modalHtml += '<tr data-filename="'+filename+'">';
                            modalHtml += '<td><input type="checkbox" class="file-checkbox"></td>';
                            modalHtml += '<td>'+filename+'</td>';
                            modalHtml += '<td>';
                            // Кнопка "Встроить" (оставляем прежнюю логику)
                            modalHtml += '<button class="embed-file-btn">Встроить</button> ';
                            // Если файл видео, добавляем кнопку для создания маркера плеера (будет кнопка "Смотреть")
                            if (["mp4", "webm", "avi", "mov"].indexOf(ext) >= 0) {
                                modalHtml += '<button class="player-file-btn">Плеер</button> ';
                            }
                            modalHtml += '<button class="download-file-btn">Скачать</button> ';
                            modalHtml += '<button class="delete-file-btn">Удалить</button>';
                            modalHtml += '</td>';
                            modalHtml += '</tr>';
                        });
                        modalHtml += '</tbody></table>';
                        modalHtml += '<div id="storage-bulk-actions">';
                        modalHtml += '<button id="embed-selected-btn">Встроить выбранное</button> ';
                        modalHtml += '<button id="delete-selected-btn">Удалить выбранное</button>';
                        modalHtml += '</div>';
                    }
                    // Убрана кнопка открытия папки в проводнике
                    // modalHtml += '<button id="open-storage-folder-btn" style="background-color:#ff5722; color:#fff; margin-top:10px;">Открыть папку в проводнике (Ctrl+Q)</button>';
                    
                    modalHtml += '</div>'; // #storage-modal-body
                    modalHtml += '</div>'; // #storage-modal

                    $('body').append(modalHtml);

                    // Закрытие модального окна
                    $('#storage-modal-close, #storage-modal-overlay').on('click', function() {
                        $('#storage-modal, #storage-modal-overlay').remove();
                    });

                    // Обработчик «Выбрать все»
                    $('#select-all-files').on('change', function() {
                        $('.file-checkbox').prop('checked', $(this).prop('checked'));
                    });

                    // Обработчик для одиночного встраивания
                    $('.embed-file-btn').on('click', function() {
                        var filename = $(this).closest('tr').data('filename');
                        embedFile(filename);
                        $('#storage-modal, #storage-modal-overlay').remove();
                    });

                    // Обработчик для кнопки "Плеер" (для видеофайлов)
                    $('.player-file-btn').on('click', function() {
                        var filename = $(this).closest('tr').data('filename');
                        var fileUrl = "/workspace/" + window.currentProject + "/" + filename;
                        var newVideo = { title: filename, file: fileUrl };
                        
                        // Проверяем, существует ли уже кнопка-плейер в редакторе
                        var $marker = $('#editor').find('#video-player-button');
                        if ($marker.length === 0) {
                            var playerData = { videos: [newVideo] };
                            var jsonData = JSON.stringify(playerData);
                            var buttonHtml = '<button id="video-player-button" data-videos=\'' + jsonData + '\' contenteditable="false" class="video-btn">Смотреть</button>';
                            $('#editor').append(buttonHtml);
                        } else {
                            var existingData = $marker.attr('data-videos');
                            try {
                                var oldData = existingData ? JSON.parse(existingData) : { videos: [] };
                                if (!oldData.videos || !Array.isArray(oldData.videos)) {
                                    oldData.videos = [];
                                }
                                oldData.videos.push(newVideo);
                                $marker.attr('data-videos', JSON.stringify(oldData));
                            } catch (e) {
                                console.error("Ошибка парсинга данных плеера:", e);
                            }
                        }
                        alert("Видео добавлено. Для просмотра нажмите кнопку 'Смотреть' в редакторе.");
                    });

                    // Обработчик для скачивания файла
                    $('.download-file-btn').on('click', function(e) {
                        e.preventDefault();
                        var filename = $(this).closest('tr').data('filename');
                        var fileUrl = "/workspace/" + window.currentProject + "/" + filename;
                        var a = document.createElement('a');
                        a.href = fileUrl;
                        a.download = filename;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                    });

                    // Обработчик для одиночного удаления
                    $('.delete-file-btn').on('click', function() {
                        var filename = $(this).closest('tr').data('filename');
                        if (confirm("Удалить файл " + filename + "?")) {
                            deleteFiles([filename], function() {
                                refreshStorageList();
                            });
                        }
                    });

                    // Массовое встраивание выбранных файлов
                    $('#embed-selected-btn').on('click', function() {
                        var selectedFiles = [];
                        $('.file-checkbox:checked').each(function() {
                            var filename = $(this).closest('tr').data('filename');
                            selectedFiles.push(filename);
                        });
                        if (selectedFiles.length === 0) {
                            alert("Выберите хотя бы один файл для встраивания.");
                        } else {
                            $.each(selectedFiles, function(index, filename) {
                                embedFile(filename);
                            });
                            $('#storage-modal, #storage-modal-overlay').remove();
                        }
                    });

                    // Массовое удаление выбранных файлов
                    $('#delete-selected-btn').on('click', function() {
                        var selectedFiles = [];
                        $('.file-checkbox:checked').each(function() {
                            var filename = $(this).closest('tr').data('filename');
                            selectedFiles.push(filename);
                        });
                        if (selectedFiles.length === 0) {
                            alert("Выберите хотя бы один файл для удаления.");
                        } else {
                            if (confirm("Удалить выбранные файлы?")) {
                                deleteFiles(selectedFiles, function() {
                                    refreshStorageList();
                                });
                            }
                        }
                    });
                } else {
                    alert("Ошибка: " + response.error);
                }
            },
            error: function(err) {
                alert("Ошибка запроса: " + err.responseText);
            }
        });
    }

    // Функция для обновления списка файлов в модальном окне
    function refreshStorageList() {
        if (!window.currentProject) return;
        $.ajax({
            url: '/storage_api',
            type: 'GET',
            data: { project_name: window.currentProject },
            success: function(response) {
                if (response.success) {
                    var tbody = '';
                    if (response.files.length === 0) {
                        tbody = '<tr><td colspan="3">Файлы не найдены.</td></tr>';
                    } else {
                        $.each(response.files, function(index, filename) {
                            var ext = filename.split('.').pop().toLowerCase();
                            tbody += '<tr data-filename="'+filename+'">';
                            tbody += '<td><input type="checkbox" class="file-checkbox"></td>';
                            tbody += '<td>'+filename+'</td>';
                            tbody += '<td>';
                            tbody += '<button class="embed-file-btn">Встроить</button> ';
                            if (["mp4", "webm", "avi", "mov"].indexOf(ext) >= 0) {
                                tbody += '<button class="player-file-btn">Плеер</button> ';
                            }
                            tbody += '<button class="download-file-btn">Скачать</button> ';
                            tbody += '<button class="delete-file-btn">Удалить</button>';
                            tbody += '</td>';
                            tbody += '</tr>';
                        });
                    }
                    $('#storage-file-table tbody').html(tbody);
                    $('#select-all-files').prop('checked', false);
                    $('.embed-file-btn').on('click', function() {
                        var filename = $(this).closest('tr').data('filename');
                        embedFile(filename);
                        $('#storage-modal, #storage-modal-overlay').remove();
                    });
                    $('.player-file-btn').on('click', function() {
                        var filename = $(this).closest('tr').data('filename');
                        var fileUrl = "/workspace/" + window.currentProject + "/" + filename;
                        var newVideo = { title: filename, file: fileUrl };
                        var $marker = $('#editor').find('#video-player-button');
                        if ($marker.length === 0) {
                            var playerData = { videos: [newVideo] };
                            var jsonData = JSON.stringify(playerData);
                            var buttonHtml = '<button id="video-player-button" data-videos=\'' + jsonData + '\' contenteditable="false" class="video-btn">Смотреть</button>';
                            $('#editor').append(buttonHtml);
                        } else {
                            var existingData = $marker.attr('data-videos');
                            try {
                                var oldData = existingData ? JSON.parse(existingData) : { videos: [] };
                                if (!oldData.videos || !Array.isArray(oldData.videos)) {
                                    oldData.videos = [];
                                }
                                oldData.videos.push(newVideo);
                                $marker.attr('data-videos', JSON.stringify(oldData));
                            } catch (e) {
                                console.error("Ошибка парсинга данных плеера:", e);
                            }
                        }
                        alert("Видео добавлено. Для просмотра нажмите кнопку 'Смотреть' в редакторе.");
                    });
                    $('.download-file-btn').on('click', function(e) {
                        e.preventDefault();
                        var filename = $(this).closest('tr').data('filename');
                        var fileUrl = "/workspace/" + window.currentProject + "/" + filename;
                        var a = document.createElement('a');
                        a.href = fileUrl;
                        a.download = filename;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                    });
                    $('.delete-file-btn').on('click', function() {
                        var filename = $(this).closest('tr').data('filename');
                        if (confirm("Удалить файл " + filename + "?")) {
                            deleteFiles([filename], function() {
                                refreshStorageList();
                            });
                        }
                    });
                }
            },
            error: function(err) {
                alert("Ошибка обновления списка: " + err.responseText);
            }
        });
    }

    // Функция для удаления файлов (AJAX DELETE-запрос)
    function deleteFiles(fileList, callback) {
        $.ajax({
            url: '/storage_api',
            type: 'DELETE',
            contentType: 'application/json',
            data: JSON.stringify({ project_name: window.currentProject, files: fileList }),
            success: function(response) {
                if (response.success) {
                    alert("Файл(ы) успешно удалены.");
                    if (typeof callback === 'function') {
                        callback();
                    }
                } else {
                    alert("Ошибка удаления: " + response.error);
                }
            },
            error: function(err) {
                alert("Ошибка запроса: " + err.responseText);
            }
        });
    }

    // Функция для встраивания файла в редактор
    function embedFile(filename) {
        var fileUrl = "/workspace/" + window.currentProject + "/" + filename;
        var ext = filename.split('.').pop().toLowerCase();
        var tag = "";
        if (["mp3", "wav", "ogg"].indexOf(ext) >= 0) {
            // Встраиваем кастомный аудиоплеер с уникальными id
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
        } else if (["jpg", "jpeg", "png", "gif"].indexOf(ext) >= 0) {
            tag = "<br><img src='" + fileUrl + "' style='max-width:100%; display:block; margin:10px auto;' class='resizable draggable'><br>";
            $('#editor').append(tag);
        } else if (["mp4", "webm", "avi", "mov"].indexOf(ext) >= 0) {
            tag = "<br><video controls style='max-width:100%; display:block; margin:10px auto;'>" +
                  "<source src='" + fileUrl + "' type='video/" + ext + "'>" +
                  "Ваш браузер не поддерживает видео тег." +
                  "</video><br>";
            $('#editor').append(tag);
        } else {
            tag = "<br><a href='" + fileUrl + "' target='_blank'>" + filename + "</a><br>";
            $('#editor').append(tag);
        }
    }

    // Привязываем обработчик нажатия к кнопке «Хранилище»
    $('#storage').on('click', function() {
        openStorageModal();
    });

    // Удалён глобальный обработчик для горячей клавиши Ctrl+Q
});
