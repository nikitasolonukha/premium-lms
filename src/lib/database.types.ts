
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "access_grants": {
                  Row: {
                    "created_at": string,"enrollment_id": string,"expires_at": string | null,"granted_by": string | null,"id": string,"revoked_at": string | null,"source": string
                  }
                  Insert: {
                    "created_at"?: string,"enrollment_id": string,"expires_at"?: string | null,"granted_by"?: string | null,"id"?: string,"revoked_at"?: string | null,"source"?: string
                  }
                  Update: {
                    "created_at"?: string,"enrollment_id"?: string,"expires_at"?: string | null,"granted_by"?: string | null,"id"?: string,"revoked_at"?: string | null,"source"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "access_grants_enrollment_id_fkey"
      columns: ["enrollment_id"]
isOneToOne: false
      referencedRelation: "enrollments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "access_grants_granted_by_fkey"
      columns: ["granted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_logs": {
                  Row: {
                    "action": string,"actor_id": string | null,"created_at": string,"entity_id": string | null,"entity_type": string,"id": number,"metadata": NonNullable<Json>
                  }
                  Insert: {
                    "action": string,"actor_id"?: string | null,"created_at"?: string,"entity_id"?: string | null,"entity_type": string,"id"?: never,"metadata"?: NonNullable<Json>
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"created_at"?: string,"entity_id"?: string | null,"entity_type"?: string,"id"?: never,"metadata"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_logs_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"block_assets": {
                  Row: {
                    "block_id": string,"media_id": string,"revision_id": string
                  }
                  Insert: {
                    "block_id": string,"media_id": string,"revision_id": string
                  }
                  Update: {
                    "block_id"?: string,"media_id"?: string,"revision_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "block_assets_media_id_fkey"
      columns: ["media_id"]
isOneToOne: false
      referencedRelation: "media"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "block_assets_revision_id_block_id_fkey"
      columns: ["revision_id","block_id"]
isOneToOne: false
      referencedRelation: "lesson_blocks"
      referencedColumns: ["revision_id","id"]
    }
                  ]
                },"categories": {
                  Row: {
                    "color": string,"created_at": string,"id": string,"name": string
                  }
                  Insert: {
                    "color"?: string,"created_at"?: string,"id"?: string,"name": string
                  }
                  Update: {
                    "color"?: string,"created_at"?: string,"id"?: string,"name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"course_revisions": {
                  Row: {
                    "accent": string,"access_mode": string,"author": string,"category_id": string | null,"course_id": string,"cover_id": string | null,"created_at": string,"description": string,"featured": boolean,"id": string,"is_published": boolean,"search_vector": unknown,"sequential": boolean,"slug": string,"summary": string,"title": string,"updated_at": string,"version": number
                  }
                  Insert: {
                    "accent"?: string,"access_mode"?: string,"author"?: string,"category_id"?: string | null,"course_id": string,"cover_id"?: string | null,"created_at"?: string,"description"?: string,"featured"?: boolean,"id"?: string,"is_published"?: boolean,"search_vector"?: never,"sequential"?: boolean,"slug": string,"summary"?: string,"title": string,"updated_at"?: string,"version"?: number
                  }
                  Update: {
                    "accent"?: string,"access_mode"?: string,"author"?: string,"category_id"?: string | null,"course_id"?: string,"cover_id"?: string | null,"created_at"?: string,"description"?: string,"featured"?: boolean,"id"?: string,"is_published"?: boolean,"search_vector"?: never,"sequential"?: boolean,"slug"?: string,"summary"?: string,"title"?: string,"updated_at"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "course_revisions_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "course_revisions_course_id_fkey"
      columns: ["course_id"]
isOneToOne: false
      referencedRelation: "courses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "course_revisions_cover_id_fkey"
      columns: ["cover_id"]
isOneToOne: false
      referencedRelation: "media"
      referencedColumns: ["id"]
    }
                  ]
                },"courses": {
                  Row: {
                    "created_at": string,"created_by": string,"deleted_at": string | null,"draft_revision_id": string | null,"id": string,"published_revision_id": string | null,"slug": string,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by": string,"deleted_at"?: string | null,"draft_revision_id"?: string | null,"id"?: string,"published_revision_id"?: string | null,"slug": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string,"deleted_at"?: string | null,"draft_revision_id"?: string | null,"id"?: string,"published_revision_id"?: string | null,"slug"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "courses_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "courses_draft_fk"
      columns: ["draft_revision_id","id"]
isOneToOne: false
      referencedRelation: "course_revisions"
      referencedColumns: ["id","course_id"]
    },{
      foreignKeyName: "courses_published_fk"
      columns: ["published_revision_id","id"]
isOneToOne: false
      referencedRelation: "course_revisions"
      referencedColumns: ["id","course_id"]
    }
                  ]
                },"enrollments": {
                  Row: {
                    "course_id": string,"created_at": string,"id": string,"user_id": string
                  }
                  Insert: {
                    "course_id": string,"created_at"?: string,"id"?: string,"user_id": string
                  }
                  Update: {
                    "course_id"?: string,"created_at"?: string,"id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "enrollments_course_id_fkey"
      columns: ["course_id"]
isOneToOne: false
      referencedRelation: "courses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "enrollments_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"learning_activity": {
                  Row: {
                    "day": string,"first_seen_at": string,"last_seen_at": string,"lesson_id": string,"user_id": string
                  }
                  Insert: {
                    "day"?: string,"first_seen_at"?: string,"last_seen_at"?: string,"lesson_id": string,"user_id": string
                  }
                  Update: {
                    "day"?: string,"first_seen_at"?: string,"last_seen_at"?: string,"lesson_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "learning_activity_lesson_id_fkey"
      columns: ["lesson_id"]
isOneToOne: false
      referencedRelation: "lessons"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "learning_activity_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"lesson_blocks": {
                  Row: {
                    "data": NonNullable<Json>,"id": string,"lesson_id": string,"position": number,"revision_id": string,"schema_version": number,"type": string
                  }
                  Insert: {
                    "data": NonNullable<Json>,"id": string,"lesson_id": string,"position": number,"revision_id": string,"schema_version"?: number,"type": string
                  }
                  Update: {
                    "data"?: NonNullable<Json>,"id"?: string,"lesson_id"?: string,"position"?: number,"revision_id"?: string,"schema_version"?: number,"type"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "lesson_blocks_revision_id_lesson_id_fkey"
      columns: ["revision_id","lesson_id"]
isOneToOne: false
      referencedRelation: "lesson_revisions"
      referencedColumns: ["revision_id","lesson_id"]
    }
                  ]
                },"lesson_revisions": {
                  Row: {
                    "course_id": string,"duration": number,"lesson_id": string,"module_id": string,"position": number,"published": boolean,"revision_id": string,"slug": string,"title": string
                  }
                  Insert: {
                    "course_id": string,"duration"?: number,"lesson_id": string,"module_id": string,"position": number,"published"?: boolean,"revision_id": string,"slug": string,"title": string
                  }
                  Update: {
                    "course_id"?: string,"duration"?: number,"lesson_id"?: string,"module_id"?: string,"position"?: number,"published"?: boolean,"revision_id"?: string,"slug"?: string,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "lesson_revisions_lesson_id_course_id_fkey"
      columns: ["lesson_id","course_id"]
isOneToOne: false
      referencedRelation: "lessons"
      referencedColumns: ["id","course_id"]
    },{
      foreignKeyName: "lesson_revisions_revision_id_module_id_course_id_fkey"
      columns: ["revision_id","module_id","course_id"]
isOneToOne: false
      referencedRelation: "module_revisions"
      referencedColumns: ["revision_id","module_id","course_id"]
    }
                  ]
                },"lesson_slug_aliases": {
                  Row: {
                    "course_id": string,"lesson_id": string,"slug": string
                  }
                  Insert: {
                    "course_id": string,"lesson_id": string,"slug": string
                  }
                  Update: {
                    "course_id"?: string,"lesson_id"?: string,"slug"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "lesson_slug_aliases_course_id_fkey"
      columns: ["course_id"]
isOneToOne: false
      referencedRelation: "courses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lesson_slug_aliases_lesson_id_fkey"
      columns: ["lesson_id"]
isOneToOne: false
      referencedRelation: "lessons"
      referencedColumns: ["id"]
    }
                  ]
                },"lessons": {
                  Row: {
                    "course_id": string,"created_at": string,"id": string
                  }
                  Insert: {
                    "course_id": string,"created_at"?: string,"id": string
                  }
                  Update: {
                    "course_id"?: string,"created_at"?: string,"id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "lessons_course_id_fkey"
      columns: ["course_id"]
isOneToOne: false
      referencedRelation: "courses"
      referencedColumns: ["id"]
    }
                  ]
                },"media": {
                  Row: {
                    "created_at": string,"duration_seconds": number | null,"filename": string,"height": number | null,"id": string,"mime_type": string,"object_key": string,"owner_id": string,"purpose": string,"sha256": string | null,"size_bytes": number,"status": string,"variant_version": number,"video_download_allowed": boolean,"width": number | null
                  }
                  Insert: {
                    "created_at"?: string,"duration_seconds"?: number | null,"filename": string,"height"?: number | null,"id"?: string,"mime_type": string,"object_key": string,"owner_id": string,"purpose"?: string,"sha256"?: string | null,"size_bytes": number,"status"?: string,"variant_version"?: number,"video_download_allowed"?: boolean,"width"?: number | null
                  }
                  Update: {
                    "created_at"?: string,"duration_seconds"?: number | null,"filename"?: string,"height"?: number | null,"id"?: string,"mime_type"?: string,"object_key"?: string,"owner_id"?: string,"purpose"?: string,"sha256"?: string | null,"size_bytes"?: number,"status"?: string,"variant_version"?: number,"video_download_allowed"?: boolean,"width"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "media_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"module_revisions": {
                  Row: {
                    "course_id": string,"module_id": string,"position": number,"revision_id": string,"title": string
                  }
                  Insert: {
                    "course_id": string,"module_id": string,"position": number,"revision_id": string,"title": string
                  }
                  Update: {
                    "course_id"?: string,"module_id"?: string,"position"?: number,"revision_id"?: string,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "module_revisions_module_id_course_id_fkey"
      columns: ["module_id","course_id"]
isOneToOne: false
      referencedRelation: "modules"
      referencedColumns: ["id","course_id"]
    },{
      foreignKeyName: "module_revisions_revision_id_course_id_fkey"
      columns: ["revision_id","course_id"]
isOneToOne: false
      referencedRelation: "course_revisions"
      referencedColumns: ["id","course_id"]
    }
                  ]
                },"modules": {
                  Row: {
                    "course_id": string,"id": string
                  }
                  Insert: {
                    "course_id": string,"id": string
                  }
                  Update: {
                    "course_id"?: string,"id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "modules_course_id_fkey"
      columns: ["course_id"]
isOneToOne: false
      referencedRelation: "courses"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "avatar_id": string | null,"created_at": string,"disabled_at": string | null,"first_name": string,"id": string,"last_name": string,"updated_at": string
                  }
                  Insert: {
                    "avatar_id"?: string | null,"created_at"?: string,"disabled_at"?: string | null,"first_name"?: string,"id": string,"last_name"?: string,"updated_at"?: string
                  }
                  Update: {
                    "avatar_id"?: string | null,"created_at"?: string,"disabled_at"?: string | null,"first_name"?: string,"id"?: string,"last_name"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "profiles_avatar_fk"
      columns: ["avatar_id"]
isOneToOne: false
      referencedRelation: "media"
      referencedColumns: ["id"]
    }
                  ]
                },"progress": {
                  Row: {
                    "completed_at": string | null,"course_id": string,"first_opened_at": string,"last_opened_at": string,"lesson_id": string,"playback_seconds": number,"user_id": string
                  }
                  Insert: {
                    "completed_at"?: string | null,"course_id": string,"first_opened_at"?: string,"last_opened_at"?: string,"lesson_id": string,"playback_seconds"?: number,"user_id": string
                  }
                  Update: {
                    "completed_at"?: string | null,"course_id"?: string,"first_opened_at"?: string,"last_opened_at"?: string,"lesson_id"?: string,"playback_seconds"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "progress_lesson_id_course_id_fkey"
      columns: ["lesson_id","course_id"]
isOneToOne: false
      referencedRelation: "lessons"
      referencedColumns: ["id","course_id"]
    },{
      foreignKeyName: "progress_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"revision_tags": {
                  Row: {
                    "revision_id": string,"tag_id": string
                  }
                  Insert: {
                    "revision_id": string,"tag_id": string
                  }
                  Update: {
                    "revision_id"?: string,"tag_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "revision_tags_revision_id_fkey"
      columns: ["revision_id"]
isOneToOne: false
      referencedRelation: "course_revisions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "revision_tags_tag_id_fkey"
      columns: ["tag_id"]
isOneToOne: false
      referencedRelation: "tags"
      referencedColumns: ["id"]
    }
                  ]
                },"saved_items": {
                  Row: {
                    "course_id": string,"created_at": string,"id": string,"lesson_id": string | null,"user_id": string
                  }
                  Insert: {
                    "course_id": string,"created_at"?: string,"id"?: string,"lesson_id"?: string | null,"user_id": string
                  }
                  Update: {
                    "course_id"?: string,"created_at"?: string,"id"?: string,"lesson_id"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "saved_items_course_id_fkey"
      columns: ["course_id"]
isOneToOne: false
      referencedRelation: "courses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "saved_items_lesson_id_course_id_fkey"
      columns: ["lesson_id","course_id"]
isOneToOne: false
      referencedRelation: "lessons"
      referencedColumns: ["id","course_id"]
    },{
      foreignKeyName: "saved_items_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"settings": {
                  Row: {
                    "config": NonNullable<Json>,"id": boolean,"updated_at": string
                  }
                  Insert: {
                    "config"?: NonNullable<Json>,"id"?: boolean,"updated_at"?: string
                  }
                  Update: {
                    "config"?: NonNullable<Json>,"id"?: boolean,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"slug_aliases": {
                  Row: {
                    "course_id": string,"created_at": string,"slug": string
                  }
                  Insert: {
                    "course_id": string,"created_at"?: string,"slug": string
                  }
                  Update: {
                    "course_id"?: string,"created_at"?: string,"slug"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "slug_aliases_course_id_fkey"
      columns: ["course_id"]
isOneToOne: false
      referencedRelation: "courses"
      referencedColumns: ["id"]
    }
                  ]
                },"tags": {
                  Row: {
                    "id": string,"name": string
                  }
                  Insert: {
                    "id"?: string,"name": string
                  }
                  Update: {
                    "id"?: string,"name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"user_roles": {
                  Row: {
                    "role": string,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "role"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "role"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_roles_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "analytics":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"analytics_page":
{ Args: { "page"?: number }; Returns: Json
                           },
"audit_index":
{ Args: { "date_from"?: string,"date_to"?: string,"page"?: number,"q_action"?: string,"q_actor"?: string,"q_entity"?: string }; Returns: Json
                           },
"branding":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"branding_media":
{ Args: { "kind": string }; Returns: string
                           },
"catalog":
{ Args: { "category"?: string,"page"?: number,"q"?: string,"saved"?: boolean,"sort"?: string,"staff"?: boolean,"status_filter"?: string,"tag"?: string }; Returns: Json
                           },
"consume_service_limit":
{ Args: { "k": string,"maximum": number,"seconds": number }; Returns: number
                           },
"consume_user_limit":
{ Args: { "kind": string }; Returns: number
                           },
"course_document":
{ Args: { "cid": string,"draft"?: boolean }; Returns: Json
                           },
"course_progress":
{ Args: { "cid": string }; Returns: Json
                           },
"create_media":
{ Args: { "filename": string,"mid": string,"mime_type": string,"purpose"?: string,"size_bytes": number }; Returns: Json
                           },
"delete_course":
{ Args: { "cid": string }; Returns: Json
                           },
"delete_media":
{ Args: { "mid": string }; Returns: Json
                           },
"download_asset":
{ Args: { "mid": string }; Returns: Json
                           },
"finalize_media":
{ Args: { "accepted"?: boolean,"height"?: number,"mid": string,"owner": string,"sha": string,"width"?: number }; Returns: boolean
                           },
"finalize_media_v2":
{ Args: { "accepted"?: boolean,"height"?: number,"mid": string,"owner": string,"session_id": string,"sha": string,"variant_version"?: number,"width"?: number }; Returns: boolean
                           },
"lesson_index":
{ Args: { "page"?: number,"q"?: string,"saved"?: boolean }; Returns: Json
                           },
"library":
{ Args: { "page"?: number,"q"?: string }; Returns: Json
                           },
"list_users":
{ Args: { "course_filter"?: string,"page"?: number,"q"?: string,"role_filter"?: string,"verified_filter"?: string }; Returns: Json
                           },
"mutate_category":
{ Args: { "cid": string,"color": string,"label": string,"remove"?: boolean }; Returns: Json
                           },
"observe_video_config":
{ Args: { "cloudflare": boolean,"environment": string,"fingerprint": string,"mux": boolean }; Returns: boolean
                           },
"operations":
{ Args: { "op": string,"payload"?: Json }; Returns: Json
                           },
"playback_context":
{ Args: { "bid": string,"draft"?: boolean,"lid": string }; Returns: Json
                           },
"publish_course":
{ Args: { "cid": string,"expected_version": number }; Returns: Json
                           },
"record_progress":
{ Args: { "complete"?: boolean,"lid": string,"seconds"?: number }; Returns: Json
                           },
"runtime_settings":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"save_course":
{ Args: { "doc": Json,"expected_version": number }; Returns: Json
                           },
"save_item":
{ Args: { "cid": string,"enabled": boolean,"lid": string }; Returns: Json
                           },
"set_access":
{ Args: { "cid": string,"enabled": boolean,"target_user": string }; Returns: Json
                           },
"set_role":
{ Args: { "new_role": string,"target_user": string }; Returns: Json
                           },
"set_user_disabled":
{ Args: { "disabled": boolean,"target_user": string }; Returns: Json
                           },
"staff_session_status":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"student_summary":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"touch_staff_session":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"update_profile":
{ Args: { "avatar_id"?: string,"first_name": string,"last_name": string }; Returns: Json
                           },
"update_settings":
{ Args: { "doc": Json }; Returns: Json
                           },
"worker_api":
{ Args: { "op": string,"payload"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            
          }
        }
} as const

