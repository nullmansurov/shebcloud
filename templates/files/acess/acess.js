// access.js

// Обработчик нажатия на кнопку "Доступ"
document.getElementById("access").addEventListener("click", function () {
    // Используем глобальную переменную window.currentProject
    const projectName = window.currentProject;
    if (!projectName) {
        alert('Проект не выбран! Пожалуйста, выберите проект перед открытием доступа.');
        return;
    }

    // Выполняем GET-запрос к эндпоинту /access, передавая project_name
    fetch('/access?project_name=' + encodeURIComponent(projectName), {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json'
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            if (data.access) {
                // Если проект уже открыт для доступа, показываем ссылку
                showModal(data.share_url);
            } else {
                // Если доступ не открыт – предлагаем ввести share_id для открытия доступа
                showModalForNewShareId();
            }
        } else {
            alert('Ошибка: ' + data.error);
        }
    })
    .catch(error => {
        console.error('Ошибка:', error);
        alert('Что-то пошло не так');
    });
});

// Функция для показа модального окна с ссылкой на общий доступ и кнопкой для удаления доступа
function showModal(shareUrl) {
    // Преобразуем shareUrl к относительной ссылке и декодируем кириллицу
    let relativeUrl = shareUrl;
    try {
        const urlObj = new URL(shareUrl);
        relativeUrl = decodeURIComponent(urlObj.pathname);
    } catch (e) {
        console.error('Ошибка преобразования URL:', e);
    }

    const modalContent = `
        <div class="modal-header">
            <h5 class="modal-title" id="modalLabel">Проект открыт для общего доступа</h5>
            <button type="button" class="close" data-dismiss="modal" aria-label="Закрыть">
                <span aria-hidden="true">&times;</span>
            </button>
        </div>
        <div class="modal-body">
            <p>Ссылка для доступа к проекту:</p>
            <a href="${relativeUrl}" target="_blank">${relativeUrl}</a>
        </div>
        <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-dismiss="modal">Закрыть</button>
            <button type="button" class="btn btn-danger" id="deleteAccess">Удалить доступ</button>
        </div>
    `;
    document.getElementById('modalContent').innerHTML = modalContent;
    $('#accessModal').modal('show');

    // Обработчик для удаления доступа
    document.getElementById('deleteAccess').addEventListener('click', function () {
        if (!window.currentProject) {
            alert('Проект не выбран!');
            return;
        }
        if (!confirm('Вы действительно хотите удалить общий доступ?')) {
            return;
        }
        fetch('/access', {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ project_name: window.currentProject })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                alert('Общий доступ закрыт');
                $('#accessModal').modal('hide');
            } else {
                alert('Ошибка: ' + data.error);
            }
        })
        .catch(error => {
            console.error('Ошибка:', error);
            alert('Что-то пошло не так');
        });
    });
}

// Функция для показа модального окна с формой ввода share_id
function showModalForNewShareId() {
    const modalContent = `
        <div class="modal-header">
            <h5 class="modal-title" id="modalLabel">Открыть общий доступ для проекта</h5>
            <button type="button" class="close" data-dismiss="modal" aria-label="Закрыть">
                <span aria-hidden="true">&times;</span>
            </button>
        </div>
        <div class="modal-body">
            <form id="shareForm">
                <div class="form-group">
                    <label for="share_id">Введите идентификатор доступа (share_id):</label>
                    <input type="text" class="form-control" id="share_id" required>
                </div>
            </form>
        </div>
        <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-dismiss="modal">Отмена</button>
            <button type="button" class="btn btn-primary" id="saveShareId">Сохранить</button>
        </div>
    `;
    document.getElementById('modalContent').innerHTML = modalContent;
    $('#accessModal').modal('show');

    // Обработчик для кнопки "Сохранить" внутри модального окна
    document.getElementById('saveShareId').addEventListener('click', function () {
        const shareId = document.getElementById('share_id').value;
        if (!shareId) {
            alert('Пожалуйста, укажите идентификатор доступа (share_id)');
            return;
        }
        saveShareId(shareId);
    });
}

// Функция для отправки POST-запроса с данными для открытия доступа
function saveShareId(shareId) {
    const projectName = window.currentProject;
    if (!projectName) {
        alert('Проект не выбран!');
        return;
    }
    fetch('/access', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ project_name: projectName, share_id: shareId })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            alert('Доступ открыт! Ссылка: ' + data.share_url);
            $('#accessModal').modal('hide');
        } else {
            alert('Ошибка: ' + data.error);
        }
    })
    .catch(error => {
        console.error('Ошибка:', error);
        alert('Что-то пошло не так');
    });
}
