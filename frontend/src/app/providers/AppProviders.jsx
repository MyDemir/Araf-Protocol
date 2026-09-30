import { ThemeProvider } from './ThemeProvider';
import { SessionProvider } from './SessionProvider';

export const AppProviders = ({ children }) => {
  return (
    <ThemeProvider>
      <SessionProvider>
        {children}
      </SessionProvider>
    </ThemeProvider>
  );
};

export default AppProviders;
