import { useState } from 'react';
import './App.css';
import Auth from './components/Auth';
import { Language } from './lib/translations';

function App() {
    const [lang, setLang] = useState<Language>('ru');

    return (
        <div id="app">
            <Auth lang={lang} setLang={setLang} />
        </div>
    )
}

export default App