import 'package:flutter/material.dart';

class AppTheme {
  static const Color _seedColor = Color(0xFF0B7A75);
  static const Color _accentColor = Color(0xFFF2B544);

  static ThemeData light() {
    final ColorScheme baseScheme = ColorScheme.fromSeed(
      seedColor: _seedColor,
      brightness: Brightness.light,
    );
    final ColorScheme colorScheme = baseScheme.copyWith(
      primary: _seedColor,
      secondary: _accentColor,
      surface: const Color(0xFFFFFBF5),
      surfaceContainerHighest: const Color(0xFFE3F0ED),
      outlineVariant: const Color(0xFFD4DFDB),
    );

    return ThemeData(
      useMaterial3: true,
      colorScheme: colorScheme,
      scaffoldBackgroundColor: const Color(0xFFF4F7F6),
      appBarTheme: AppBarTheme(
        centerTitle: false,
        backgroundColor: colorScheme.surface.withValues(alpha: 0.96),
        foregroundColor: const Color(0xFF0F1F1E),
        elevation: 0,
        scrolledUnderElevation: 0,
        surfaceTintColor: Colors.transparent,
        titleTextStyle: const TextStyle(
          fontSize: 22,
          fontWeight: FontWeight.w700,
          letterSpacing: -0.4,
          color: Color(0xFF0F1F1E),
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: colorScheme.surface.withValues(alpha: 0.98),
        surfaceTintColor: Colors.transparent,
        indicatorColor: colorScheme.primary.withValues(alpha: 0.14),
        height: 74,
        labelTextStyle: WidgetStateProperty.resolveWith((states) {
          final bool selected = states.contains(WidgetState.selected);
          return TextStyle(
            fontWeight: selected ? FontWeight.w700 : FontWeight.w600,
            color: selected ? colorScheme.primary : const Color(0xFF53635F),
          );
        }),
      ),
      progressIndicatorTheme: ProgressIndicatorThemeData(
        color: colorScheme.primary,
        circularTrackColor: colorScheme.primary.withValues(alpha: 0.18),
        linearTrackColor: colorScheme.primary.withValues(alpha: 0.12),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: const Color(0xFF10211F),
        contentTextStyle: const TextStyle(color: Colors.white),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
      ),
    );
  }
}
