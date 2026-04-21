import React from 'react';

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: '',
    };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      errorMessage: error?.message || 'Se produjo un error inesperado en la interfaz.',
    };
  }

  componentDidCatch(error, errorInfo) {
    console.error('AppErrorBoundary capturo un error de renderizado:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="page-shell">
        <section className="page-hero">
          <div>
            <span className="eyebrow">Error</span>
            <h1>La vista se ha interrumpido</h1>
            <p>
              Hemos bloqueado el fallo para que la app no se quede en blanco.
              {` ${this.state.errorMessage}`}
            </p>
          </div>
          <button type="button" className="logout-button" onClick={this.handleReload}>
            Recargar pagina
          </button>
        </section>
      </div>
    );
  }
}

export default AppErrorBoundary;
