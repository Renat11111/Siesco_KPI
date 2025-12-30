import { translations, Language } from '../lib/translations';
import DailyComparisonChart from './DailyComparisonChart';
import ColleagueRankingChart from './ColleagueRankingChart';
import YearlyRankingChart from './YearlyRankingChart';
import ReturnedTasksCard from './ReturnedTasksCard';

interface AnalyticsViewProps {
    lang: Language;
}

export default function AnalyticsView({ lang }: AnalyticsViewProps) {
    const t = translations[lang];

    return (
        <div className="analytics-container animate-fade-in">
             <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', paddingBottom: '2rem' }}>
                <DailyComparisonChart lang={lang} refreshTrigger={0} />
                <ReturnedTasksCard lang={lang} />
                <ColleagueRankingChart lang={lang} />
                <YearlyRankingChart lang={lang} />
             </div>
        </div>
    );
}