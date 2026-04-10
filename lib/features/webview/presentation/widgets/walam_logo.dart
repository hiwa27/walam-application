import 'package:flutter/material.dart';

class WalamLogo extends StatelessWidget {
  const WalamLogo({
    super.key,
    this.size = 72,
    this.showWordmark = false,
    this.textColor,
  });

  final double size;
  final bool showWordmark;
  final Color? textColor;

  @override
  Widget build(BuildContext context) {
    final Color foreground = textColor ?? const Color(0xFF0E1E1C);

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: size,
          height: size,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(size * 0.32),
            gradient: const LinearGradient(
              colors: [Color(0xFF0B7A75), Color(0xFF12A995)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            boxShadow: [
              BoxShadow(
                color: const Color(0xFF0B7A75).withValues(alpha: 0.28),
                blurRadius: 22,
                offset: const Offset(0, 12),
              ),
            ],
          ),
          alignment: Alignment.center,
          child: Text(
            'W',
            style: TextStyle(
              color: Colors.white,
              fontSize: size * 0.46,
              fontWeight: FontWeight.w800,
              letterSpacing: -1.2,
            ),
          ),
        ),
        if (showWordmark) ...[
          SizedBox(width: size * 0.2),
          Text(
            'Walam',
            style: TextStyle(
              color: foreground,
              fontSize: size * 0.34,
              fontWeight: FontWeight.w800,
              letterSpacing: -0.8,
            ),
          ),
        ],
      ],
    );
  }
}
