import path from 'node:path';

// Each call exposes exactly one unanswered question; seed values skip known facts.
export const questions = [
  { key: 'goal', title: 'Какова ваша цель?', hint: 'Что вы хотите уметь делать самостоятельно и в каком контексте?' },
  { key: 'level', title: 'Каков ваш текущий уровень?', hint: 'Знания, опыт и примеры выполненных работ.' },
  { key: 'hoursPerWeek', title: 'Сколько часов в неделю вы готовы учиться?', type: 'number' },
  { key: 'deadline', title: 'Какой желаемый срок обучения?', hint: 'Дата, продолжительность или «без фиксированного срока».' },
  { key: 'constraints', title: 'Какие есть практические ограничения?', hint: 'Оборудование, бюджет, инструменты, материалы, участники и доступ к обратной связи. Можно ответить «нет».' },
  { key: 'priorities', title: 'Какие темы приоритетны, а какие не входят в цель?', hint: 'Если особых пожеланий нет, укажите это.' },
  { key: 'format', title: 'В каком формате сохранить roadmap?', choices: ['html', 'pdf', 'both'], labels: ['HTML — интерактивный сайт', 'PDF — полный документ', 'Оба формата'] },
  { key: 'outputDirectory', title: 'Куда сохранить roadmap?', hint: 'Абсолютный путь к папке. В ней будет создан отдельный каталог результата.' }
];
export const optionalInputs = ['definitionOfDone'];
export function validateAnswer(key, value) {
  const q = questions.find(q => q.key === key);
  if (!q && !optionalInputs.includes(key)) throw new Error(`Неизвестное поле: ${key}`);
  if (key === 'hoursPerWeek') {
    const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0 || n > 168) throw new Error('Часы в неделю: число больше 0 и не больше 168.');
    return n;
  }
  if (typeof value !== 'string' || !value.trim()) throw new Error('Введите непустой ответ.');
  value = value.trim();
  if (key === 'format' && !['html', 'pdf', 'both'].includes(value)) throw new Error('Формат: html, pdf или both.');
  if (key === 'outputDirectory' && !path.isAbsolute(value)) throw new Error('Укажите абсолютный путь к папке.');
  return value;
}
export function nextQuestion(answers) {
  return questions.find(q => answers[q.key] === undefined) ?? null;
}
