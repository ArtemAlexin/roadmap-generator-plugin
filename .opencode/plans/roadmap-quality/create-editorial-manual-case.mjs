import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {fixture} from '../../../tests/fixture.js';

const {roadmap,inputs}=fixture();
inputs.outputDirectory='(editorial-only; no build)';
const before=structuredClone(roadmap);
before.stages=before.stages.slice(0,1);
before.scenarios[0].practiceIds=['M01-P1'];
before.scenarios[0].dodIds=['M01-D1'];
before.evidence=before.evidence.slice(0,1);
before.coverage=before.coverage.slice(0,1);
before.stages[0].purpose='Сделайте структуру.';
before.stages[0].steps[0].explanation='Семантика — смысл. Примените.';
before.stages[0].practice[0].actions='Сделайте страницу. Проверьте.';
before.stages[0].practice[0].acceptance='Все верно.';
before.stages[0].practice[0].pitfalls='Выбирайте элементы по внешнему виду, проверьте смысл.';
before.about.instructions='Откройте первый этап, изучите материалы и выполните практику. Не воспринимайте отметки прогресса как оценку качества..';
// The source metadata itself says no real source check occurred; the verified flags below are deliberately inconsistent.
before.sources[0].verification.result='Источник проверен.';
before.sources[0].verification.sufficient=true;
before.sources[0].status='verified';
before.evidence[0].observation='Источник подтверждает материал.';
before.evidence[0].status='verified';
before.coverage[0].status='verified';
before.report.factualChecks='Проверено.';
before.report.limitations='Ограничений нет.';

const passA=structuredClone(before);
passA.stages[0].purpose='Создайте документ по данным учебного события и объясните, как выбранные смысловые области помогают читателю найти программу и условия участия. Откройте файл в браузере; если исходные сведения потерялись, сравните страницу с заданием и восстановите их.';
passA.stages[0].steps[0].explanation='Семантические элементы HTML обозначают роль содержимого, а не его оформление. Например, заголовок сообщает тему следующего раздела. При чтении материала выделите смысловые области, затем примените их к исходным данным события.';
passA.stages[0].steps[0].extraction='Выпишите области и их назначение; используйте этот список при создании страницы.';
passA.stages[0].practice[0].actions='Сначала внесите в index.html название, дату, место и сведения двух разделов из входных данных. Затем выберите HTML-элементы по назначению каждой области и откройте файл в браузере. Не переносите готовый шаблон; при пропуске сведений сверьте страницу с исходными данными.';
passA.stages[0].practice[0].acceptance='Сверьте результат с DoD M01-D1: в index.html присутствуют название, дата, место и оба раздела; структура заголовков следует смыслу разделов. Если одного элемента нет, исправьте страницу и повторите сверку.';
passA.stages[0].dod[0].recovery.exercise='Создайте страницу другого события с тремя смысловыми разделами по новому набору данных; затем объясните выбор элементов.';
passA.stages[0].checkpoint='До завершения этапа откройте страницу в браузере, сверьте исходные данные и объясните выбор заголовков по M01-D1.';
passA.about.schedule='В этой уменьшенной демонстрации рассматривается только M01; срок прохождения не заявляется.';
passA.about.milestones='M01: семантическая структура → проверка страницы.';
passA.about.timeBasis='Часы этапа сохранены из синтетического fixture; фактическое время не измерялось.';
passA.about.instructions='Создайте index.html по входным данным, проверьте его в браузере и сопоставьте с M01-D1. Это тестовый пример, не подтверждённый план обучения.';
passA.competences[0].action='Создать страницу события и объяснить, почему выбранные элементы соответствуют смыслу разделов.';
passA.competences[0].tasks='Новая страница события с названием, датой, местом, программой и условиями участия.';
passA.competences[0].errors='Выбор элемента по внешнему виду вместо назначения раздела.';
passA.competences[0].verification='Новый файл index.html: проверьте полноту исходных данных и объясните назначение заголовков.';
passA.scenarios[0].description='Создать страницу события при доступе к браузеру и документации; исходные данные перечислены в практике M01-P1.';
passA.sources[0].status='description-only';
passA.sources[0].verification.result='Фактическое содержимое URL и указанный фрагмент в этом примере не открывались и не проверялись.';
passA.sources[0].verification.checkedAt='не проверялся';
passA.sources[0].verification.checkedFragments=[];
passA.sources[0].verification.sufficient=false;
passA.sources[0].verification.sufficiencyReason='Пока источник и фрагмент не проверены, достаточность для обучения не установлена.';
passA.evidence[0].observation='Наблюдение подтверждает только синтетическую запись; источник и фрагмент не проверялись.';
passA.evidence[0].status='unconfirmed';
passA.coverage[0].depth='Проверена только структурная связь записей в синтетическом примере; содержательное покрытие источником не подтверждено.';
passA.coverage[0].status='structural';
passA.report.factualChecks='Ручной синтетический проход A: прочитаны title/about; все поля M01 и его step/material/extraction, practice, DoD/recovery, errors, repetition/checkpoint; competence C01; scenario SC01; source S01; evidence E01; coverage; все report-поля. Уточнены действие, объяснение и проверяемый результат. Проверка реального источника не выполнялась.';
passA.report.limitations='Это учебный synthetic case, не программа для учащегося. Источник S01 и фрагмент не проверялись; статус оставлен description-only, sufficient=false, evidence unconfirmed и coverage structural. Результат preliminary.';
passA.report.changes=['M01: уточнены цель, объяснение HTML и порядок практики; acceptance связан с M01-D1.','S01: снято неподтверждённое verified/sufficient; содержимое источника оставлено gap.','E01/coverage: отражены непроверенность источника и структурный, а не содержательный характер покрытия.'];

const passB=structuredClone(passA);
passB.stages[0].practice[0].pitfalls='Выбирайте элементы не только по внешнему виду; проверьте, соответствует ли элемент назначению области.';
passB.about.instructions='Откройте первый этап, изучите материалы и выполните практику. Не воспринимайте отметки прогресса как оценку качества.';
passB.report.factualChecks+=' Отдельный проход B: заново вычитаны те же разделы; исправлены пунктуация в M01-P1 и лишняя точка в about.instructions. Содержание и protected values не менялись.';

const protectedValues={
  userGoal:inputs.goal,title:before.title,url:before.sources[0].url,sourceTitle:before.sources[0].title,
  sourceFragment:before.sources[0].fragment,allInputs:inputs,practiceInput:before.stages[0].practice[0].inputs,
  ids:{roadmap:before.id,stage:before.stages[0].id,step:before.stages[0].steps[0].id,practice:before.stages[0].practice[0].id,dod:before.stages[0].dod[0].id,source:before.sources[0].id},
  numbers:{hours:before.stages[0].hours,stepHours:before.stages[0].steps[0].hours,practiceHours:before.stages[0].practice[0].hours,dodThreshold:before.stages[0].dod[0].threshold,aboutReserve:before.about.reserveHours,sourceStudy:before.sources[0].studyHours}
};
const artifact={case:'Manual synthetic editorial example; fixture-derived, one stage only.',input:inputs,protectedValues,before,passA,passB};
await fs.writeFile(path.join(path.dirname(fileURLToPath(import.meta.url)),'editorial-manual-case.json'),JSON.stringify(artifact,null,2)+'\n');
