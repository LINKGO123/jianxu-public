import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import './styles.css';
const root = document.getElementById('root');
if (!root)
    throw new Error('缺少应用入口');
createRoot(root).render(<App />);
