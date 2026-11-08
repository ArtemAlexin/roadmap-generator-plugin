import path from 'node:path';

export const formatChoices=['html','pdf','both'];
export const formatLabels=['Интерактивный локальный сайт (ZIP)','PDF-документ','Интерактивный сайт (ZIP) и PDF'];
const retiredInputs=new Set(['scheduleMode','hoursPerWeek','deadline']);
export function planningInputs(answers){return Object.fromEntries(Object.entries(answers).filter(([key])=>!retiredInputs.has(key)));}
export function planningFor(_answers){
  return {mode:'effort-only',calendarBound:false,
    instruction:'Оценивайте приблизительную трудоёмкость шагов, практики, этапов и обязательной программы в часах; укажите резерв отдельно. Определите порядок по зависимостям и DoD, не рассчитывайте календарную длительность и не запрашивайте личный бюджет времени. Исторические ответы о графике сохранены как raw-данные и не используются при планировании.'};
}
export function deliveryFor(format){
  if(!formatChoices.includes(format))return null;
  return {format,label:formatLabels[formatChoices.indexOf(format)],
    ...(format!=='pdf'?{website:{kind:'interactive-local-website',archive:'<roadmap-directory>-html.zip',entryPoint:'index.html',singleHtmlFile:false,
      description:'Многостраничный сайт: карта зависимостей, отдельные страницы этапов, поиск, темы и локальный прогресс. Распаковать ZIP и открыть index.html без сервера.'}}:{}),
    ...(format!=='html'?{pdf:{file:'roadmap.pdf',description:'Полный линейный документ.'}}:{})};
}

// Each call exposes exactly one unanswered question; seed values skip known facts.
export const questions = [
  { key: 'goal', title: 'Какова ваша цель?', hint: 'Что вы хотите уметь делать самостоятельно и в каком контексте?' },
  { key: 'level', title: 'Каков ваш текущий уровень?', hint: 'Знания, опыт и примеры выполненных работ.' },
  { key: 'constraints', title: 'Какие есть практические ограничения?', hint: 'Оборудование, бюджет, инструменты, материалы, участники и доступ к обратной связи. Можно ответить «нет».' },
  { key: 'priorities', title: 'Какие темы приоритетны, а какие не входят в цель?', hint: 'Если особых пожеланий нет, укажите это.' },
  { key: 'format', title: 'В каком виде подготовить roadmap?', choices: formatChoices, labels: formatLabels,
    hint: 'Сайт — ZIP с интерактивной картой, отдельными страницами этапов, поиском и прогрессом. После распаковки работает локально без сервера. PDF — полный документ. Можно выбрать оба.' },
  { key: 'outputDirectory', title: 'Куда сохранить roadmap?', hint: 'Абсолютный путь к папке. В ней будет создан отдельный каталог результата.' }
];
export const optionalInputs = ['definitionOfDone'];
export function validateAnswer(key, value) {
  const q = questions.find(q => q.key === key);
  if (!q && !optionalInputs.includes(key)) throw new Error(`Неизвестное поле: ${key}`);
  if (typeof value !== 'string' || !value.trim()) throw new Error('Введите непустой ответ.');
  value = value.trim();
  if(key==='format'&&formatLabels.includes(value))value=formatChoices[formatLabels.indexOf(value)];
  if (key === 'format' && !['html', 'pdf', 'both'].includes(value)) throw new Error('Формат: html, pdf или both.');
  if (key === 'outputDirectory' && !path.isAbsolute(value)) {
    const example=process.platform==='win32'?'C:\\Roadmaps':'/home/user/roadmaps';
    throw new Error(`Путь «${value}» не является абсолютным. Укажите абсолютный путь к папке, например «${example}», а не относительное имя папки.`);
  }
  return value;
}
export function nextQuestion(answers) {
  return questions.find(q => answers[q.key]===undefined) ?? null;
}
