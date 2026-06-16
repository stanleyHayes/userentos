import { createTheme } from '@mui/material/styles'

const shared = {
  typography: {
    fontFamily: "'Outfit', 'Instrument Sans', system-ui, -apple-system, sans-serif",
    h1: { fontFamily: "'DM Sans', 'Outfit', system-ui, sans-serif", fontWeight: 800 },
    h2: { fontFamily: "'DM Sans', 'Outfit', system-ui, sans-serif", fontWeight: 800 },
    h3: { fontFamily: "'DM Sans', 'Outfit', system-ui, sans-serif", fontWeight: 800 },
    h4: { fontFamily: "'DM Sans', 'Outfit', system-ui, sans-serif", fontWeight: 800 },
    h5: { fontFamily: "'DM Sans', 'Outfit', system-ui, sans-serif", fontWeight: 800 },
    h6: { fontFamily: "'DM Sans', 'Outfit', system-ui, sans-serif", fontWeight: 800 },
  },
  shape: { borderRadius: 14 },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          textRendering: 'optimizeLegibility',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          borderRadius: 999,
          fontWeight: 700,
          textTransform: 'none' as const,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          fontWeight: 700,
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          borderRadius: 8,
          fontSize: '0.75rem',
          fontWeight: 600,
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottomColor: 'rgba(148, 163, 184, 0.18)',
          paddingTop: 14,
          paddingBottom: 14,
        },
        head: {
          fontSize: '0.75rem',
          fontWeight: 800,
          textTransform: 'uppercase' as const,
          color: '#64748b',
        },
      },
    },
    MuiTextField: {
      defaultProps: { variant: 'outlined' as const, fullWidth: true, size: 'medium' as const, margin: 'none' as const },
      styleOverrides: {
        root: {
          minWidth: 0,
        },
      },
    },
    MuiFormControl: {
      defaultProps: { margin: 'none' as const },
      styleOverrides: {
        root: {
          minWidth: 0,
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          fontSize: '0.9375rem',
          minHeight: 52,
          backgroundColor: 'var(--rentos-card-muted)',
          transition: 'border-color 160ms ease, box-shadow 160ms ease, background-color 160ms ease',
          '&:hover .MuiOutlinedInput-notchedOutline': { borderWidth: 2 },
          '&.Mui-focused': {
            backgroundColor: 'var(--rentos-card)',
            boxShadow: 'var(--rentos-ring)',
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderWidth: 2 },
        },
        input: { padding: '15px 16px' },
        multiline: { padding: '15px 16px' },
      },
    },
    MuiInputLabel: {
      defaultProps: { shrink: true },
      styleOverrides: {
        root: { fontSize: '0.9375rem', fontWeight: 600 },
      },
    },
    MuiFormHelperText: {
      styleOverrides: { root: { fontSize: '0.75rem', marginLeft: 4, marginTop: 4 } },
    },
    MuiSelect: {
      defaultProps: { variant: 'outlined' as const },
      styleOverrides: { select: { padding: '15px 16px' } },
    },
    MuiMenuItem: {
      styleOverrides: { root: { fontSize: '0.875rem', minHeight: 42 } },
    },
    MuiSwitch: {
      styleOverrides: {
        root: { width: 44, height: 26, padding: 0 },
        switchBase: { padding: 3, '&.Mui-checked': { transform: 'translateX(18px)', '& + .MuiSwitch-track': { opacity: 1 } } },
        thumb: { width: 20, height: 20 },
        track: { borderRadius: 13, opacity: 0.3 },
      },
    },
  },
}

export const lightTheme = createTheme({
  ...shared,
  palette: {
    mode: 'light',
    primary: { main: '#1e3a5f', light: '#2d5a8e', dark: '#0f1f33' },
    secondary: { main: '#f59e0b' },
    success: { main: '#10b981' },
    error: { main: '#ef4444' },
    warning: { main: '#f59e0b' },
    background: { default: '#f8fafc', paper: '#ffffff' },
    text: { primary: '#161927', secondary: '#6b7280' },
    divider: '#e2e8f0',
  },
})

export const darkTheme = createTheme({
  ...shared,
  palette: {
    mode: 'dark',
    primary: { main: '#7dd3fc', light: '#bae6fd', dark: '#0f1f33' },
    secondary: { main: '#fbbf24' },
    success: { main: '#2dd4bf' },
    error: { main: '#ef4444' },
    warning: { main: '#fbbf24' },
    background: { default: '#0a0d12', paper: '#14121f' },
    text: { primary: '#f6f3ff', secondary: '#9c96ad' },
    divider: '#30283d',
  },
})
