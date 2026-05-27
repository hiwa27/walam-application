export type User = {
  fb_user_id: string;
  name: string;
  email?: string;
  is_admin: boolean;
  is_active: boolean;
  expiry_date?: string | null;
  timezone?: string;
  referral_code?: string;
  referred_by_user_id?: string | null;
  referral_balance_usd?: number;
  referral_owner_pending_usd?: number;
  referral_earned_usd?: number;
  referral_used_usd?: number;
};

export type Page = {
  id: string;
  name: string;
  platform?: 'facebook' | 'instagram';
  source_page_id?: string;
  category?: string;
  fan_count?: number;
  picture?: string | null;
  has_token: boolean;
  restricted?: boolean;
  restriction_reason?: string;
};

export type DashboardSummary = {
  pages: number;
  active_posts: number;
  replies_today: number;
  total_replies: number;
  feedbacks: number;
};

export type Automation = {
  id: number;
  post_id: string;
  page_id?: string;
  comment_id?: string | null;
  message?: string | null;
  pm_message?: string | null;
  pm_image_url?: string | null;
  pm_audio_url?: string | null;
  pm_video_url?: string | null;
  pm_image_label?: string | null;
  pm_audio_label?: string | null;
  pm_buttons_json?: string | null;
  active: number;
  like_active: number;
  pm_active: number;
  auto_reply_comment: number;
  auto_reply_pm: number;
  ai_enabled: number;
  updated?: string;
  created_at?: string;
  post_info?: {
    message?: string;
    story?: string;
    created_time?: string;
    full_picture?: string | null;
    picture_url?: string | null;
    permalink_url?: string;
  };
};

export type AdminInboxMessage = {
  id?: number;
  title?: string;
  body?: string;
  message?: string;
  from_user_id?: string;
  to_user_id?: string;
  created_at?: string;
  read_at?: string | null;
  is_unread?: boolean;
};
