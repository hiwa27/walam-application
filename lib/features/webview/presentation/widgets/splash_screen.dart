import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';
import 'package:walam_mobile_app/features/webview/presentation/widgets/walam_logo.dart';

class WalamSplashScreen extends StatefulWidget {
  const WalamSplashScreen({super.key, this.enableVideoPlayback = true});

  final bool enableVideoPlayback;

  @override
  State<WalamSplashScreen> createState() => _WalamSplashScreenState();
}

class _WalamSplashScreenState extends State<WalamSplashScreen> {
  VideoPlayerController? _videoController;
  bool _videoReady = false;

  @override
  void initState() {
    super.initState();
    if (!widget.enableVideoPlayback) {
      return;
    }

    _videoController = VideoPlayerController.asset(
      'assets/videos/splash_logo.mp4',
    );

    _videoController!
      ..setLooping(true)
      ..setVolume(0)
      ..initialize().then((_) {
        if (!mounted) {
          return;
        }
        _videoController!.play();
        setState(() {
          _videoReady = true;
        });
      });
  }

  @override
  void dispose() {
    _videoController?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);

    return DecoratedBox(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          colors: [Color(0xFFF2FBF9), Color(0xFFE3F3EF), Color(0xFFFFF6E9)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
      ),
      child: Stack(
        fit: StackFit.expand,
        children: [
          const _GlowBubble(
            alignment: Alignment.topRight,
            size: 220,
            color: Color(0x2612A995),
          ),
          const _GlowBubble(
            alignment: Alignment.bottomLeft,
            size: 180,
            color: Color(0x22F2B544),
          ),
          Center(
            child: TweenAnimationBuilder<double>(
              duration: const Duration(milliseconds: 900),
              curve: Curves.easeOutCubic,
              tween: Tween(begin: 0.92, end: 1),
              builder: (context, value, child) {
                return Opacity(
                  opacity: value,
                  child: Transform.scale(scale: value, child: child),
                );
              },
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  _videoReady
                      ? ClipRRect(
                          borderRadius: BorderRadius.circular(24),
                          child: SizedBox(
                            width: 110,
                            height: 110,
                            child: FittedBox(
                              fit: BoxFit.cover,
                              child: SizedBox(
                                width: _videoController!.value.size.width,
                                height: _videoController!.value.size.height,
                                child: VideoPlayer(_videoController!),
                              ),
                            ),
                          ),
                        )
                      : const WalamLogo(size: 90, showWordmark: true),
                  const SizedBox(height: 22),
                  Text(
                    'بە یەک کرتە، دەستت دەگات بە Walam.',
                    style: theme.textTheme.titleMedium?.copyWith(
                      color: const Color(0xFF33514D),
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 18),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 10,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.78),
                      borderRadius: BorderRadius.circular(24),
                      border: Border.all(color: const Color(0xFFD7E7E1)),
                    ),
                    child: Text(
                      'ئەزموونی پارێزراوی WebView بۆ walam.app',
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: const Color(0xFF4D6561),
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _GlowBubble extends StatelessWidget {
  const _GlowBubble({
    required this.alignment,
    required this.size,
    required this.color,
  });

  final Alignment alignment;
  final double size;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: alignment,
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(shape: BoxShape.circle, color: color),
      ),
    );
  }
}
