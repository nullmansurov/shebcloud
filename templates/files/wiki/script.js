// Создание нового контейнера при клике на кнопку с id="wikipedia"
document.getElementById('wikipedia').addEventListener('click', function() {
    var editor = document.getElementById('editor');

    // Создаём уникальный ID для каждого нового контейнера
    var uniqueId = 'wiki-search-container-' + Date.now();

    // Создаём контейнер
    var wikiContainer = document.createElement('div');
    wikiContainer.id = uniqueId;
    wikiContainer.classList.add("wiki-container");
    
    // Делаем контейнер нередактируемым
    wikiContainer.setAttribute('contenteditable', 'false');

    wikiContainer.innerHTML = `
        <input type="text" class="wiki-search" placeholder="Введите запрос">
        <button class="wiki-search-btn">Искать</button>
        <div class="wiki-result"></div>
    `;

    // Вставляем контейнер в редактор
    editor.appendChild(wikiContainer);
    wikiContainer.scrollIntoView();
    wikiContainer.querySelector('.wiki-search').focus();

    // Запускаем наблюдатель за удалением контейнера (например, при изменении текста кнопки)
    observeWikiContainerRemoval(wikiContainer);
});


// Делегирование клика по кнопке "Искать" для всех контейнеров внутри #editor
document.getElementById('editor').addEventListener('click', function(e) {
    if (e.target.classList.contains('wiki-search-btn')) {
        var wikiContainer = e.target.closest('.wiki-container');
        var queryInput = wikiContainer.querySelector('.wiki-search');
        var query = queryInput.value.trim();
        if (!query) return;

        var resultDiv = wikiContainer.querySelector('.wiki-result');
        resultDiv.innerHTML = '🔍 Ищем...';

        fetch(`https://ru.wikipedia.org/w/api.php?action=query&prop=extracts&titles=${encodeURIComponent(query)}&exintro&explaintext&format=json&origin=*`)
            .then(response => response.json())
            .then(data => {
                let pages = data.query.pages;
                let pageId = Object.keys(pages)[0];

                if (pageId === "-1") {
                    resultDiv.innerHTML = "<p class='error-msg'>❌ Ничего не найдено.</p>";
                    return;
                }

                let page = pages[pageId];
                let extract = page.extract || "Синопсис отсутствует.";

                resultDiv.innerHTML = `
                    <p class="wiki-title"><strong>${page.title}</strong></p>
                    <p class="wiki-text">${extract.length > 500 ? extract.substring(0, 500) + "..." : extract}</p>
                    <a class="wiki-link" href="https://ru.wikipedia.org/wiki/${encodeURIComponent(page.title)}" target="_blank">Перейти в Википедию</a>
                `;
            })
            .catch(error => {
                resultDiv.innerHTML = "<p class='error-msg'>⚠️ Ошибка при получении данных.</p>";
                console.error(error);
            });
    }
});


// (Опционально) Делегирование для обработки нажатия клавиши Enter в поле ввода
document.getElementById('editor').addEventListener('keydown', function(e) {
    if (e.target.classList.contains('wiki-search') && e.key === 'Enter') {
        e.preventDefault();
        var wikiContainer = e.target.closest('.wiki-container');
        var query = e.target.value.trim();
        if (!query) return;

        var resultDiv = wikiContainer.querySelector('.wiki-result');
        resultDiv.innerHTML = '🔍 Ищем...';

        fetch(`https://ru.wikipedia.org/w/api.php?action=query&prop=extracts&titles=${encodeURIComponent(query)}&exintro&explaintext&format=json&origin=*`)
            .then(response => response.json())
            .then(data => {
                let pages = data.query.pages;
                let pageId = Object.keys(pages)[0];

                if (pageId === "-1") {
                    resultDiv.innerHTML = "<p class='error-msg'>❌ Ничего не найдено.</p>";
                    return;
                }

                let page = pages[pageId];
                let extract = page.extract || "Синопсис отсутствует.";

                resultDiv.innerHTML = `
                    <p class="wiki-title"><strong>${page.title}</strong></p>
                    <p class="wiki-text">${extract.length > 500 ? extract.substring(0, 500) + "..." : extract}</p>
                    <a class="wiki-link" href="https://ru.wikipedia.org/wiki/${encodeURIComponent(page.title)}" target="_blank">Перейти в Википедию</a>
                `;
            })
            .catch(error => {
                resultDiv.innerHTML = "<p class='error-msg'>⚠️ Ошибка при получении данных.</p>";
                console.error(error);
            });
    }
});


// Наблюдатель за изменениями в контейнере.
// Если текст кнопки (служебный элемент) будет удалён, удаляем весь контейнер.
function observeWikiContainerRemoval(container) {
    var target = container.querySelector('.wiki-search-btn');
    var observer = new MutationObserver(function(mutations) {
        if (target.textContent.trim() === '') {
            container.remove();
            observer.disconnect();
        }
    });
    observer.observe(target, { childList: true, subtree: true, characterData: true });
}
