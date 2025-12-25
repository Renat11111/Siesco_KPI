import './App.css';
import Auth from './components/Auth';
import { SettingsProvider, useSettings } from './lib/SettingsContext';

function AppContent() {
    const { lang, setLang } = useSettings();
    return <Auth lang={lang} setLang={setLang} />;
}

function App() {
    return (
        <SettingsProvider>
            <div id="app">
                <AppContent />
            </div>
        </SettingsProvider>
    )
}

export default App
