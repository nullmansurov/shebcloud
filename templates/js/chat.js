document.addEventListener('DOMContentLoaded', function() {
    const chatContainer = document.getElementById('chat-container');
    const form = document.getElementById('chat-form');
    const input = document.getElementById('chat-input');

    // Функция для загрузки истории сообщений
    function fetchChat() {
        fetch('/chat_api')
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    chatContainer.innerHTML = '';
                    data.messages.forEach(msg => {
                        const messageDiv = document.createElement('div');
                        messageDiv.classList.add('chat-message');
                        messageDiv.innerHTML = '<strong>' + msg.username + ':</strong> ' + msg.text;
                        chatContainer.appendChild(messageDiv);
                    });
                    // Автопрокрутка вниз
                    chatContainer.scrollTop = chatContainer.scrollHeight;
                } else {
                    console.error('Ошибка при загрузке сообщений');
                }
            })
            .catch(error => console.error('Ошибка при выполнении запроса:', error));
    }

    // Отправка нового сообщения
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        const text = input.value.trim();
        if (!text) return;
        fetch('/chat_api', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ text: text })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                input.value = '';
                fetchChat();
            } else {
                console.error('Ошибка при отправке сообщения');
            }
        })
        .catch(error => console.error('Ошибка при выполнении запроса:', error));
    });

    // Обновляем чат каждые 3 секунды
    setInterval(fetchChat, 3000);
    fetchChat();
});
