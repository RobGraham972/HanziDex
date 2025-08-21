--
-- PostgreSQL database dump
--

\restrict 71mGYAVM93BuhMjcgNhdanwMuG3d6pekMPH80h9lioexJn9TkSsdH2wfeSauJ0v

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.items (
    id integer NOT NULL,
    value text NOT NULL,
    type text NOT NULL,
    hsk_level integer,
    components text[],
    is_contained_in text[],
    constituent_items text[],
    radicals_contained text[],
    stroke_count integer,
    pinyin text,
    english_definition text,
    created_at timestamp with time zone DEFAULT now(),
    kinds text[] DEFAULT '{}'::text[] NOT NULL,
    display_pinyin text,
    CONSTRAINT items_type_check CHECK ((type = ANY (ARRAY['radical'::text, 'character'::text, 'word'::text, 'both'::text])))
);


ALTER TABLE public.items OWNER TO postgres;

--
-- Name: items_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.items_id_seq OWNER TO postgres;

--
-- Name: items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.items_id_seq OWNED BY public.items.id;


--
-- Name: stage_parts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.stage_parts (
    hanzi text,
    part_symbol text,
    relation text,
    "position" integer
);


ALTER TABLE public.stage_parts OWNER TO postgres;

--
-- Name: mv_character_components; Type: MATERIALIZED VIEW; Schema: public; Owner: postgres
--

CREATE MATERIALIZED VIEW public.mv_character_components AS
 SELECT hanzi,
    array_agg(DISTINCT part_symbol ORDER BY part_symbol) AS components
   FROM public.stage_parts
  WHERE ((relation = 'component'::text) OR (relation IS NULL))
  GROUP BY hanzi
  WITH NO DATA;


ALTER MATERIALIZED VIEW public.mv_character_components OWNER TO postgres;

--
-- Name: stage_characters; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.stage_characters (
    hanzi text NOT NULL,
    stroke_count integer
);


ALTER TABLE public.stage_characters OWNER TO postgres;

--
-- Name: stage_hsk; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.stage_hsk (
    value text,
    pinyin text,
    english_definition text,
    hsk_level integer
);


ALTER TABLE public.stage_hsk OWNER TO postgres;

--
-- Name: stage_readings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.stage_readings (
    hanzi text NOT NULL,
    pinyin text,
    english_definition text
);


ALTER TABLE public.stage_readings OWNER TO postgres;

--
-- Name: user_item_progress; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_item_progress (
    user_id integer NOT NULL,
    item_id integer NOT NULL,
    status text NOT NULL,
    level integer DEFAULT 0,
    last_reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT user_item_progress_status_check CHECK ((status = ANY (ARRAY['LOCKED'::text, 'DISCOVERABLE'::text, 'DISCOVERED'::text])))
);


ALTER TABLE public.user_item_progress OWNER TO postgres;

--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id integer NOT NULL,
    username text NOT NULL,
    password_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.users_id_seq OWNER TO postgres;

--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: v_items_characters; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.v_items_characters AS
 SELECT id,
    value,
    type,
    hsk_level,
    components,
    is_contained_in,
    constituent_items,
    radicals_contained,
    stroke_count,
    pinyin,
    english_definition,
    created_at,
    kinds
   FROM public.items
  WHERE ('character'::text = ANY (kinds));


ALTER VIEW public.v_items_characters OWNER TO postgres;

--
-- Name: v_items_radicals; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.v_items_radicals AS
 SELECT id,
    value,
    type,
    hsk_level,
    components,
    is_contained_in,
    constituent_items,
    radicals_contained,
    stroke_count,
    pinyin,
    english_definition,
    created_at,
    kinds
   FROM public.items
  WHERE ('radical'::text = ANY (kinds));


ALTER VIEW public.v_items_radicals OWNER TO postgres;

--
-- Name: v_items_words; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.v_items_words AS
 SELECT id,
    value,
    type,
    hsk_level,
    components,
    is_contained_in,
    constituent_items,
    radicals_contained,
    stroke_count,
    pinyin,
    english_definition,
    created_at,
    kinds
   FROM public.items
  WHERE ('word'::text = ANY (kinds));


ALTER VIEW public.v_items_words OWNER TO postgres;

--
-- Name: items id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.items ALTER COLUMN id SET DEFAULT nextval('public.items_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: items items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_pkey PRIMARY KEY (id);


--
-- Name: stage_characters stage_characters_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stage_characters
    ADD CONSTRAINT stage_characters_pkey PRIMARY KEY (hanzi);


--
-- Name: stage_readings stage_readings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stage_readings
    ADD CONSTRAINT stage_readings_pkey PRIMARY KEY (hanzi);


--
-- Name: user_item_progress user_item_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_item_progress
    ADD CONSTRAINT user_item_progress_pkey PRIMARY KEY (user_id, item_id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: idx_items_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_items_type ON public.items USING btree (type);


--
-- Name: idx_items_value; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_items_value ON public.items USING btree (value);


--
-- Name: idx_uip_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_uip_status ON public.user_item_progress USING btree (status);


--
-- Name: idx_uip_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_uip_user ON public.user_item_progress USING btree (user_id);


--
-- Name: ix_mv_char_components_hanzi; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_mv_char_components_hanzi ON public.mv_character_components USING btree (hanzi);


--
-- Name: uniq_items_value; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX uniq_items_value ON public.items USING btree (value);


--
-- Name: uniq_items_value_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX uniq_items_value_type ON public.items USING btree (value, type);


--
-- Name: user_item_progress user_item_progress_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_item_progress
    ADD CONSTRAINT user_item_progress_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE CASCADE;


--
-- Name: user_item_progress user_item_progress_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_item_progress
    ADD CONSTRAINT user_item_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict 71mGYAVM93BuhMjcgNhdanwMuG3d6pekMPH80h9lioexJn9TkSsdH2wfeSauJ0v

