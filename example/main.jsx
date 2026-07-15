import { render, StoreProvider, Router } from 'danio-js'
import { store } from './store.js'
import { App } from './App.jsx'
import './styles.css'

render(
  <StoreProvider store={store}>
    <Router>
      <App />
    </Router>
  </StoreProvider>,
  document.getElementById('root'),
)
