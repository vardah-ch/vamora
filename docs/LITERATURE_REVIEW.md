# Literature Review

**Scope.** This review covers the work that bears on VAMORA's four research directions:

1. personalised memory retrieval and grounded generation;
2. privacy-preserving, consent-aware caregiver collaboration;
3. human–AI interaction for cognitive assistance;
4. responsible AI in dementia support.

It is a **scoping review**, not a systematic review. No PRISMA protocol was registered, and the searches were not exhaustive.

**Verification protocol.** Every reference below was checked against the OpenAlex index on 2026-11-13, either by DOI or by title, with author and year matched. Reference details (title, authors, year, venue, DOI) come from that check, not from memory. During verification:

- Two years recalled from memory were wrong and have been corrected.
- One recalled paper could not be found and was **excluded**.
- One high-profile report, the 2020 *Lancet* Commission on dementia (DOI 10.1016/S0140-6736(20)30367-6), was **flagged as retracted** by OpenAlex. It is therefore not used as evidence here. *This flag should be checked manually before anyone relies on that report.*

**Depth of reading.** Summaries marked † are based on the abstract only, because the full text was not reviewed. Summaries without the mark describe the paper's widely known contribution. Anyone citing a specific claim from these papers should still read the original.

---

## 1. Memory support and reminiscence technology

People with Alzheimer's disease lose **episodic** memory early, while recognition and older autobiographical memories are often relatively preserved. Assistive technology has long tried to exploit this.

- **Lifelogging.** **Hodges et al. (2006)** introduced *SenseCam*, a wearable camera whose image streams served as retrospective memory cues. **Berry et al. (2007)** reported improved autobiographical recall in a single patient with limbic encephalitis. A later critical review (**Silva et al., 2016**) found the evidence promising but based on small samples and inconsistent methods.
- **What makes a good cue.** **Lee & Dey (2007, 2008)** studied how caregivers cue people with episodic memory impairment and built a lifelogging memory appliance around those cues. **Kalnikaitė et al. (2010)** showed that different lifelog media (images vs. location) support different kinds of remembering.
- **Reminiscence.** **Astell et al. (2010)** (CIRCA) showed that a touch-screen multimedia reminiscence system can support conversation between people with dementia and their caregivers. **Lazar, Thompson & Demiris (2014)** systematically reviewed technology-supported reminiscence and found heterogeneous designs and weak outcome measurement. The Cochrane review by **Woods et al. (2018)** found small, inconsistent benefits of reminiscence therapy on quality of life, cognition and communication, with effects that depend on setting and modality.
- **Cognitive orthotics.** Earlier AI work, such as *Autominder* (**Pollack et al., 2003**) and *COACH* (**Mihailidis et al., 2008**), used planning and decision-theoretic models to prompt daily activities. That line of work is the precedent for VAMORA's routine-aware retrieval.

**Gap for VAMORA:** these systems *store* and *present* cues. None combines a **typed personal knowledge store** (people, places, events, routines) with **natural-language retrieval** and explicit, verifiable grounding of generated answers.

## 2. Retrieval-augmented generation and hallucination

- **Retrieval-augmented generation.** RAG (**Lewis et al., 2020**) conditions generation on retrieved passages. **Gao et al. (2023)** survey the design space: retrievers, fusion, and verification.
- **Retrieval components.** Classical lexical retrieval with BM25 (**Robertson & Zaragoza, 2009**) remains a strong baseline. Dense sentence embeddings (**Reimers & Gurevych, 2019**), including compact distilled models such as MiniLM (**Wang et al., 2020**), capture paraphrase. Reciprocal Rank Fusion (**Cormack, Clarke & Büttcher, 2009**) is a simple, robust way to combine rankings.
- **Hallucination.** **Ji et al. (2023)** survey hallucination in natural-language generation. **Li et al. (2023)** (HaluEval) and **Rawte et al. (2023)** benchmark and categorise it. **Farquhar et al. (2024)** detect confabulations through *semantic entropy* over sampled answers. **Min et al. (2023)** (FActScore) score factual precision at the level of atomic claims. **Es et al. (2024)** (RAGAS) propose reference-free RAG metrics such as faithfulness and answer relevance.
- **Health settings.** **Singhal et al. (2023)** showed that LLMs encode substantial clinical knowledge but still produce harmful or incomplete answers. **Agarwal et al. (2026)†** characterise hallucinations in LLM answers to healthcare queries. A physician-led red-teaming study (**Draelos et al., 2026†**) evaluated four public chatbots on 222 patient-posed questions (888 responses) and reported unsafe answers.

**Gap for VAMORA:** published RAG evaluations use public corpora. The *personal* case looks different:

- the corpus is tiny and private;
- facts are about the user, and an error ("your son visited") can be distressing;
- the user may not be able to detect the error.

Abstention when evidence is missing matters more here than answer coverage.

## 3. Conversational agents for people with dementia and their carers

- **Spoken dialogue.** **Wolters, Kelly & Kilgour (2015)** derived design requirements for spoken-dialogue interfaces for people with dementia (e.g. slower pacing, tolerance of repetition). **Rudzicz et al. (2015)** found that speech recognition degrades with Alzheimer's-related speech changes, and that simple, directive prompts work better.
- **Care dyads.** **Zubatiy et al. (2021)** studied commercial voice assistants with dyads of older adults with mild cognitive impairment (MCI) and their care partners. They report value in shared routines and reminders, alongside breakdowns and privacy tensions.
- **LLMs in dementia care.**
  - **Treder, Lee & Tsvetanov (2024)†** give an overview of LLM applications and risks.
  - **Cheng & Ng (2024)†** built a GPT-4o caregiver psychoeducation chatbot (*PDC30*) and report acceptability in a mixed-methods study.
  - **Zhou et al. (2025)†** evaluated LLM support for informal caregivers of people with early-stage dementia.
  - A recent systematic review (**Chan, Ng & Liu, 2026†**) synthesises conversational-AI interventions for cognitive and social training and notes heterogeneity and short evaluations.

**Gap for VAMORA:** most LLM work in this area targets **caregivers**, or uses general knowledge. Few systems answer *personal* questions for the person with dementia from *their own* memories, and fewer measure whether those answers are grounded.

## 4. Privacy, autonomy and consent in dementia technology

- **The ethics debate.** Reviews of assistive and surveillance technology (**Niemeijer et al., 2010**; **Zwijsen, Niemeijer & Hertogh, 2011**) frame the debate as safety *versus* autonomy and privacy. **Hall et al. (2019)** argue for moving beyond that dichotomy to include workforce monitoring and equity.
- **Views of families and people with dementia.** Families and professionals often accept tracking for safety (**Landau et al., 2010**). People with dementia report mixed experiences of surveillance (**Niemeijer et al., 2015**). Caregivers in workshops raised dignity and consent concerns about home video monitoring (**Mulvenna et al., 2017**).
- **Advance planning.** **Berridge et al. (2022)†** developed and tested the feasibility of a self-administered tool that lets people living with dementia plan, in advance, how monitoring technology may be used. This is close in spirit to VAMORA's patient-controlled grants.
- **Consent and capacity.** **Appelbaum (2007)** sets out the functional, decision-specific assessment of capacity: capacity is not lost wholesale at diagnosis. **Thorogood et al. (2018)** give consent recommendations for research and data sharing involving people with dementia, including supported decision-making and representatives.
- **Access control and privacy frameworks.** Role-based access control (**Sandhu et al., 1996**) is the classical model. Contextual integrity (**Nissenbaum, 2004**) frames privacy as appropriate information *flows* for a context, rather than secrecy.
- **Practical ethics.** **Godwin (2012)** derived a participatory ethics checklist for assistive technology. **Meiland et al. (2017)** set out a position on development, usability, effectiveness and ethics for technology for community-dwelling people with dementia.

**Gap for VAMORA:** most ethics work is qualitative or normative. Few systems **operationalise** these principles in software and test them:

- decision-specific consent;
- representatives whose authority is recorded but not assumed;
- restriction that is always possible;
- a transparency log the patient can read.

## 5. Affect recognition from faces

**Barrett et al. (2019)** review the evidence and conclude that emotional states cannot be reliably inferred from facial movements alone. Commercial facial-affect classifiers perform worse on spontaneous than on posed expressions (**Dupré et al., 2020**). Expression-recognition accuracy is lower for older adults' faces (**Kim et al., 2021**). These findings motivated redesigning VAMORA's mood camera as an *optional estimate the person confirms*.

## 6. Human–AI interaction and evaluation instruments

- **Design guidelines.** **Amershi et al. (2019)** give 18 guidelines for human–AI interaction. Examples include "make clear how well the system can do what it can do", "support efficient correction" and "make clear why the system did what it did". VAMORA's source cards, uncertainty notes and confirm-before-save follow these.
- **Participatory design.** Participatory design with older people (**Lindsay et al., 2012**) shapes the proposed study design.
- **Instruments.** The proposed usability study uses the **System Usability Scale** (benchmarks in **Bangor, Kortum & Miller, 2008**) and **NASA-TLX** (**Hart & Staveland, 1988**). Clinical context: the MMSE (**Folstein, Folstein & McHugh, 1975**). Broader context on AI in medicine: **Topol (2019)** and **Mittelstadt et al. (2016)** on the ethics of algorithms.
- **Mapping technology to care.** Lorenz et al. (2017) map technology tools onto the dementia care pathway.

---

## Literature matrix

| Paper | Year | Research problem | Methodology | Findings | Limitations | Relevance to VAMORA |
|---|---|---|---|---|---|---|
| Hodges et al., *SenseCam: A Retrospective Memory Aid* | 2006 | Passive capture of cues for recall | System design + pilot | Image lifelogs usable as retrospective cues | Small pilots; capture ≠ retrieval | Precedent for photo-based cues |
| Berry et al., *Wearable camera… improve autobiographical memory* | 2007 | Can lifelog review aid recall? | Single-case study | Improved recall with SenseCam review | n = 1, not dementia | Evidence base for cue-based recall |
| Lee & Dey, *Providing good memory cues…* | 2007 | Which cues help episodic memory impairment? | Two user studies with caregivers | Good cues differ between impaired and unimpaired people | Small samples | Informs cue selection/presentation |
| Lee & Dey, *Lifelogging memory appliance…* | 2008 | Designing a memory appliance | Design + deployment | Caregiver-curated cues aid reminiscence | Pre-LLM; manual curation | Caregiver contribution model |
| Kalnikaitė et al., *How lifelogs mediate memory* | 2010 | Which lifelog media support remembering | Lab study | Media types support different memory processes | Healthy participants | Multimodal (photo/voice/text) store |
| Silva et al., *Critical review… wearable cameras on memory* | 2016 | Effect of wearable cameras on memory | Critical review | Promising but weak, heterogeneous evidence | Few RCTs | Cautions against efficacy claims |
| Astell et al., *Touch screen… relationships (CIRCA)* | 2010 | Supporting conversation in dementia | Evaluation sessions | Multimedia reminiscence supports interaction | Generic, not personal, content | Conversation as goal, not recall accuracy |
| Lazar, Thompson & Demiris, *Systematic review… reminiscence* | 2014 | State of reminiscence technology | Systematic review | Varied designs, limited outcomes | Pre-LLM | Need for better evaluation |
| Woods et al., *Reminiscence therapy for dementia* (Cochrane) | 2018 | Effectiveness of reminiscence | Meta-analysis of RCTs | Small, setting-dependent benefits | Heterogeneous trials | Sets modest expectations for impact |
| Pollack et al., *Autominder* | 2003 | Reminding daily activities | AI planning system | Adaptive reminders feasible | Early prototype | Precedent for routine-aware support |
| Mihailidis et al., *COACH… handwashing* | 2008 | Automated prompting for ADLs | Efficacy study | Prompting reduced caregiver assistance | Single task | Prompting via context |
| Lewis et al., *Retrieval-Augmented Generation* | 2020 | Knowledge-intensive generation | Retriever + seq2seq | RAG improves factuality on open QA | Public corpora | Core architecture of Cara |
| Gao et al., *RAG for LLMs: A Survey* | 2023 | Map RAG design space | Survey | Taxonomy of retrieval/augmentation/verification | Preprint | Design reference |
| Robertson & Zaragoza, *BM25 and Beyond* | 2009 | Probabilistic relevance | Theory + review | BM25 strong lexical baseline | Lexical only | Lexical component |
| Reimers & Gurevych, *Sentence-BERT* | 2019 | Efficient sentence embeddings | Siamese fine-tuning | Strong semantic similarity at low cost | English-centric training | Dense component |
| Wang et al., *MiniLM* | 2020 | Compressing transformers | Distillation | Small models retain much performance | Preprint | Runs offline on a CPU |
| Cormack et al., *Reciprocal rank fusion* | 2009 | Combining rankings | Empirical IR study | RRF beats more complex fusion | TREC-style data | Fusion method |
| Ji et al., *Survey of Hallucination in NLG* | 2023 | Characterise hallucination | Survey | Taxonomy, metrics, mitigations | Pre-dates many LLMs | Framing of grounding |
| Li et al., *HaluEval* | 2023 | Measure hallucination | Benchmark | LLMs often fail to recognise hallucinated content | General domain | Evaluation framing |
| Farquhar et al., *Semantic entropy* | 2024 | Detect confabulation | Sampling + entropy | Detects arbitrary false answers | Needs many samples (cost) | Future verifier alternative |
| Min et al., *FActScore* | 2023 | Factual precision of long text | Atomic-claim verification | Fine-grained factuality scoring | Needs a knowledge source | Basis for proposed claim-level metric |
| Es et al., *RAGAS* | 2023/24 | Evaluate RAG without references | LLM-judged metrics | Faithfulness/relevance metrics | LLM-judge bias | Proposed metrics for companion evaluation |
| Singhal et al., *LLMs encode clinical knowledge* | 2023 | Clinical QA by LLMs | Benchmarks + clinician rating | High scores but harmful gaps | Exam-style questions | Why Cara gives no medical advice |
| Agarwal et al., *MedHalu*† | 2026 | Hallucination in health answers | Dataset + analysis | Hallucinations in healthcare queries | Abstract only reviewed | Risk context |
| Draelos et al., *LLMs provide unsafe answers…*† | 2026 | Safety of chatbots for patient questions | Physician red-teaming (888 responses) | Unsafe answers found | Abstract only reviewed | Justifies the deterministic safety layer |
| Wolters, Kelly & Kilgour, *Spoken dialogue… dementia* | 2015 | Dialogue design for dementia | Requirements study | Design guidance for voice UIs | Pre-LLM | Voice interaction design |
| Rudzicz et al., *Speech interaction… Alzheimer's* | 2015 | ASR/dialogue with AD | Lab study with robot | ASR errors; directive prompts help | Small n | Limits of voice input |
| Zubatiy et al., *Conversational agents for MCI dyads* | 2021 | Voice assistants for dyads | Field deployment | Benefits + breakdowns + privacy tensions | MCI, not dementia | Dyadic design, privacy |
| Treder et al., *LLMs for dementia care and research*† | 2024 | Potential of LLMs | Narrative overview | Opportunities and risks | Abstract only reviewed | Positioning |
| Cheng & Ng, *PDC30 Chatbot*† | 2024 | Caregiver psychoeducation | GPT-4o chatbot, mixed methods | Acceptable to caregivers | Abstract only reviewed | Contrast: caregiver-, not patient-facing |
| Zhou et al., *LLMs for informal caregivers*† | 2025 | LLM support for carers | Mixed methods | Abstract only reviewed | Abstract only reviewed | Related caregiver-facing LLM work |
| Chan, Ng & Liu, *Conversational AI… systematic review*† | 2026 | Effectiveness of conversational AI | Systematic review | Heterogeneous, short evaluations | Abstract only reviewed | Up-to-date positioning |
| Niemeijer et al., *Surveillance technologies in residential care* | 2010 | Ethics of surveillance | Literature overview | Safety vs autonomy tensions | Residential care | Ethical framing |
| Zwijsen et al., *Ethics of assistive technology* | 2011 | Ethics of AT for elderly | Literature overview | Privacy, autonomy, obtrusiveness issues | Overview | Ethical framing |
| Landau et al., *Families' views of tracking* | 2010 | Stakeholder views on tracking | Qualitative | Families favour safety | Israel only | Family-misuse risk |
| Niemeijer et al., *Experiences… with surveillance* | 2015 | Lived experience of surveillance | Qualitative | Mixed experiences; dignity matters | Residential care | Patient voice |
| Mulvenna et al., *Caregivers on home surveillance ethics* | 2017 | Ethics of home video monitoring | Workshops | Consent and dignity concerns | Concept stage | Video/media permissions |
| Hall et al., *Beyond safety vs autonomy* | 2019 | Ethics of monitoring in care | Qualitative | Broader ethical aspects | Long-term care | Framing beyond a dichotomy |
| Berridge et al., *Advance planning for technology use*† | 2022 | Involving people with dementia in monitoring decisions | Tool design + feasibility | Feasible self-administered tool | Abstract only reviewed | Closest analogue to patient-controlled grants |
| Appelbaum, *Competence to consent* | 2007 | Assessing decisional capacity | Clinical review | Capacity is decision-specific | Clinical guidance | No automatic loss of authority at diagnosis |
| Thorogood et al., *Consent recommendations… dementia* | 2018 | Consent for research/data sharing | Expert consensus | Supported decision-making, representatives | Research context | Consent modes design |
| Sandhu et al., *Role-based access control models* | 1996 | Access-control models | Formal models | RBAC family | Roles alone are too coarse here | Baseline that VAMORA extends |
| Nissenbaum, *Privacy as contextual integrity* | 2004 | Theory of privacy | Philosophical analysis | Privacy as appropriate flows | Normative | Permission design rationale |
| Godwin, *Ethical evaluation checklist* | 2012 | Practitioner ethics for AT | Participatory study | Ethics checklist | UK practice | Ethics review of features |
| Meiland et al., *Technologies to support community-dwelling persons with dementia* | 2017 | Development/evaluation issues | Position paper | Recommendations incl. ethics | Position paper | Evaluation plan |
| Lorenz et al., *Mapping technology onto the dementia care pathway* | 2017 | Technology landscape | Review | Map of tools across pathway | Rapidly dated | Positioning |
| Barrett et al., *Emotional expressions reconsidered* | 2019 | Can emotion be read from faces? | Systematic evidence review | Facial movements are unreliable indicators of emotion | — | Mood camera redesign |
| Dupré et al., *Eight facial affect classifiers* | 2020 | Commercial FER accuracy | Benchmark | Lower accuracy on spontaneous expressions | Specific datasets | Mood camera redesign |
| Kim et al., *Age bias in emotion detection* | 2021 | FER accuracy by age | Benchmark | Lower accuracy for older adults | Limited models/datasets | Mood camera redesign |
| Amershi et al., *Guidelines for Human-AI Interaction* | 2019 | HAI design guidance | Iterative validation | 18 guidelines | General purpose | Source cards, uncertainty, correction |
| Lindsay et al., *Participatory design with older people* | 2012 | Engaging older users in design | Case studies | Methods for PD with older adults | Not dementia-specific | Study design |
| Bangor et al., *Evaluation of the SUS* | 2008 | SUS validity/benchmarks | Analysis of many studies | Benchmarks for SUS scores | Proxy for usability | Usability metric |
| Hart & Staveland, *NASA-TLX* | 1988 | Workload measurement | Instrument development | TLX instrument | Burden for some users | Workload metric (adapted) |
| Folstein et al., *Mini-Mental State* | 1975 | Brief cognitive screen | Instrument | MMSE | Not diagnostic alone; education effects | Why VAMORA shows bands, not "decline" |
| Topol, *High-performance medicine* | 2019 | AI in medicine | Review | Promise and caution | Broad | Context |
| Mittelstadt et al., *Ethics of algorithms* | 2016 | Map ethical concerns | Conceptual review | Epistemic and normative concerns | Conceptual | Responsible-AI framing |

## Research gaps identified

**G1. Grounded, personal question answering for people with dementia is under-studied.**
Memory-aid research predates LLMs. LLM research in dementia care mostly serves caregivers or general knowledge. No evaluated system we found retrieves from a person's *own* typed memory store, answers in natural language, and measures *groundedness and abstention*.

**G2. Retrieval for tiny, private, code-switched personal corpora.**
RAG benchmarks use large public corpora. Nothing we found studies:
- kinship-centric queries ("my son");
- routine/time-dependent queries;
- Roman-Urdu code-switching.

VAMORA's exploratory result is that a multilingual embedding model did *not* help Roman-Urdu queries. That suggests a concrete gap.

**G3. Operationalised, testable consent models for dementia care software.**
The ethics literature is rich but mostly qualitative or normative. **Berridge et al. (2022)** is a notable step toward patient-directed decisions about monitoring. We did not find an open implementation that encodes all of the following *and* verifies them with automated tests:
- decision-specific consent;
- clinician-recorded representatives;
- a "restriction is always allowed" rule;
- patient-readable access logs.

**G4. Responsible affect sensing in consumer dementia apps.**
The evidence against inferring emotion from faces is strong, especially for older adults. Yet apps continue to present such inferences as facts. Designs in which the person *confirms* their own state, with inferences kept separate, are rarely described or evaluated.

## References

Agarwal, V., Jin, Y., Chandra, M., De Choudhury, M., Kumar, S., et al. (2026). MedHalu: Hallucinations in responses to healthcare queries by large language models. *Proc. ICWSM*. https://doi.org/10.1609/icwsm.v20i1.42623

Amershi, S., Weld, D., Vorvoreanu, M., Fourney, A., Nushi, B., et al. (2019). Guidelines for human-AI interaction. *CHI 2019*. https://doi.org/10.1145/3290605.3300233

Appelbaum, P. S. (2007). Assessment of patients' competence to consent to treatment. *New England Journal of Medicine*. https://doi.org/10.1056/NEJMcp074045

Astell, A. J., Ellis, M. P., Bernardi, L., Alm, N., Dye, R., et al. (2010). Using a touch screen computer to support relationships between people with dementia and caregivers. *Interacting with Computers*. https://doi.org/10.1016/j.intcom.2010.03.003

Bangor, A., Kortum, P. T., & Miller, J. (2008). An empirical evaluation of the System Usability Scale. *International Journal of Human-Computer Interaction*. https://doi.org/10.1080/10447310802205776

Barrett, L. F., Adolphs, R., Marsella, S., Martinez, A. M., & Pollak, S. D. (2019). Emotional expressions reconsidered: Challenges to inferring emotion from human facial movements. *Psychological Science in the Public Interest*. https://doi.org/10.1177/1529100619832930

Berridge, C. W., Turner, N. R., Liu, L., Karras, S. W., Chen, A., et al. (2022). Advance planning for technology use in dementia care: Development, design, and feasibility of a novel self-administered decision-making tool. *JMIR Aging*. https://doi.org/10.2196/39335

Berry, E., Kapur, N., Williams, L., Hodges, S., Watson, P., et al. (2007). The use of a wearable camera, SenseCam, as a pictorial diary to improve autobiographical memory in a patient with limbic encephalitis: A preliminary report. *Neuropsychological Rehabilitation*. https://doi.org/10.1080/09602010601029780

Chan, M. K. K., Ng, P. H. F., & Liu, K. P. Y. (2026). Conversational AI in cognitive and social training for people with dementia: A systematic review. *Healthcare*. https://doi.org/10.3390/healthcare14142106

Cheng, S.-T., & Ng, P. H. F. (2024). The PDC30 Chatbot—Development of a psychoeducational resource on dementia caregiving among family caregivers: Mixed methods acceptability study. *JMIR Aging*. https://doi.org/10.2196/63715

Cormack, G. V., Clarke, C. L. A., & Büttcher, S. (2009). Reciprocal rank fusion outperforms Condorcet and individual rank learning methods. *SIGIR 2009*. https://doi.org/10.1145/1571941.1572114

Draelos, R. L., Afreen, S., Blasko, B. J., Brazile, T. L., Chase, N., et al. (2026). Large language models provide unsafe answers to patient-posed medical questions. *npj Digital Medicine*. https://doi.org/10.1038/s41746-026-02428-5

Dupré, D., Krumhuber, E. G., Küster, D., & McKeown, G. J. (2020). A performance comparison of eight commercially available automatic classifiers for facial affect recognition. *PLOS ONE*. https://doi.org/10.1371/journal.pone.0231968

Es, S., James, J., Espinosa-Anke, L., & Schockaert, S. (2023). Ragas: Automated evaluation of retrieval augmented generation. *arXiv*. https://doi.org/10.48550/arXiv.2309.15217

Farquhar, S., Kossen, J., Kuhn, L., & Gal, Y. (2024). Detecting hallucinations in large language models using semantic entropy. *Nature*. https://doi.org/10.1038/s41586-024-07421-0

Folstein, M. F., Folstein, S. E., & McHugh, P. R. (1975). "Mini-mental state". *Journal of Psychiatric Research*. https://doi.org/10.1016/0022-3956(75)90026-6

Gao, Y., Xiong, Y., Gao, X., Jia, K., Pan, J., et al. (2023). Retrieval-augmented generation for large language models: A survey. *arXiv*. https://doi.org/10.48550/arXiv.2312.10997

Godwin, B. (2012). The ethical evaluation of assistive technology for practitioners: A checklist arising from a participatory study with people with dementia, family and professionals. *Journal of Assistive Technologies*. https://doi.org/10.1108/17549451211234975

Hall, A., Brown Wilson, C., Stanmore, E., & Todd, C. (2019). Moving beyond 'safety' versus 'autonomy': A qualitative exploration of the ethics of using monitoring technologies in long-term dementia care. *BMC Geriatrics*. https://doi.org/10.1186/s12877-019-1155-6

Hart, S. G., & Staveland, L. E. (1988). Development of NASA-TLX (Task Load Index): Results of empirical and theoretical research. *Advances in Psychology*. https://doi.org/10.1016/S0166-4115(08)62386-9

Hodges, S., Williams, L., Berry, E., Izadi, S., Srinivasan, J., et al. (2006). SenseCam: A retrospective memory aid. *UbiComp 2006, LNCS*. https://doi.org/10.1007/11853565_11

Ji, Z., Lee, N., Frieske, R., Yu, T., Su, D., et al. (2023). Survey of hallucination in natural language generation. *ACM Computing Surveys* (OpenAlex lists 2022). https://doi.org/10.1145/3571730

Kalnikaitė, V., Sellen, A., Whittaker, S., & Kirk, D. (2010). Now let me see where I was: Understanding how lifelogs mediate memory. *CHI 2010*. https://doi.org/10.1145/1753326.1753638

Kim, E., Bryant, D., Srikanth, D., & Howard, A. (2021). Age bias in emotion detection: An analysis of facial emotion recognition performance on young, middle-aged, and older adults. *AIES 2021*. https://doi.org/10.1145/3461702.3462609

Landau, R., Auslander, G. K., Werner, S., Shoval, N., & Heinik, J. (2010). Families' and professional caregivers' views of using advanced technology to track people with dementia. *Qualitative Health Research*. https://doi.org/10.1177/1049732309359171

Lazar, A., Thompson, H., & Demiris, G. (2014). A systematic review of the use of technology for reminiscence therapy. *Health Education & Behavior*. https://doi.org/10.1177/1090198114537067

Lee, M. L., & Dey, A. K. (2007). Providing good memory cues for people with episodic memory impairment. *ASSETS 2007*. https://doi.org/10.1145/1296843.1296867

Lee, M. L., & Dey, A. K. (2008). Lifelogging memory appliance for people with episodic memory impairment. *UbiComp 2008*. https://doi.org/10.1145/1409635.1409643

Lewis, P., Perez, E., Piktus, A., Petroni, F., Karpukhin, V., et al. (2020). Retrieval-augmented generation for knowledge-intensive NLP tasks. *NeurIPS 2020* (OpenAlex W3098425262).

Li, J., Cheng, X., Zhao, W. X., Nie, J.-Y., & Wen, J.-R. (2023). HaluEval: A large-scale hallucination evaluation benchmark for large language models. *EMNLP 2023*. https://doi.org/10.18653/v1/2023.emnlp-main.397

Lindsay, S., Jackson, D., Schofield, G., & Olivier, P. (2012). Engaging older people using participatory design. *CHI 2012*. https://doi.org/10.1145/2207676.2208570

Lorenz, K., Freddolino, P. P., Comas-Herrera, A., Knapp, M., & Damant, J. (2017). Technology-based tools and services for people with dementia and carers: Mapping technology onto the dementia care pathway. *Dementia*. https://doi.org/10.1177/1471301217691617

Meiland, F., Innes, A., Mountain, G., Robinson, L., van der Roest, H., et al. (2017). Technologies to support community-dwelling persons with dementia: A position paper on issues regarding development, usability, effectiveness and cost-effectiveness, deployment, and ethics. *JMIR Rehabilitation and Assistive Technologies*. https://doi.org/10.2196/rehab.6376

Mihailidis, A., Boger, J. N., Craig, T., & Hoey, J. (2008). The COACH prompting system to assist older adults with dementia through handwashing: An efficacy study. *BMC Geriatrics*. https://doi.org/10.1186/1471-2318-8-28

Min, S., Krishna, K., Lyu, X., Lewis, M., Yih, W., et al. (2023). FActScore: Fine-grained atomic evaluation of factual precision in long form text generation. *EMNLP 2023*. https://doi.org/10.18653/v1/2023.emnlp-main.741

Mittelstadt, B. D., Allo, P., Taddeo, M., Wachter, S., & Floridi, L. (2016). The ethics of algorithms: Mapping the debate. *Big Data & Society*. https://doi.org/10.1177/2053951716679679

Mulvenna, M., Hutton, A., Coates, V., Martin, S., Todd, S., et al. (2017). Views of caregivers on the ethics of assistive technology used for home surveillance of people living with dementia. *Neuroethics*. https://doi.org/10.1007/s12152-017-9305-z

Niemeijer, A. R., Frederiks, B. J. M., Riphagen, I. I., Legemaate, J., Eefsting, J. A., et al. (2010). Ethical and practical concerns of surveillance technologies in residential care for people with dementia or intellectual disabilities: An overview of the literature. *International Psychogeriatrics*. https://doi.org/10.1017/S1041610210000037

Niemeijer, A. R., Depla, M. F. I. A., Frederiks, B. J. M., & Hertogh, C. M. P. M. (2015; OpenAlex lists 2014). The experiences of people with dementia and intellectual disabilities with surveillance technologies in residential care. *Nursing Ethics*. https://doi.org/10.1177/0969733014533237

Nissenbaum, H. (2004). Privacy as contextual integrity. *Washington Law Review*, 79(1) (OpenAlex: SSRN version W3122871960).

Pollack, M. E., Brown, L., Colbry, D., McCarthy, C. E., Orosz, C., et al. (2003). Autominder: An intelligent cognitive orthotic system for people with memory impairment. *Robotics and Autonomous Systems*. https://doi.org/10.1016/S0921-8890(03)00077-0

Rawte, V., Chakraborty, S., Pathak, A., Sarkar, A., Tonmoy, S. M. T. I., et al. (2023). The troubling emergence of hallucination in large language models. *EMNLP 2023*. https://doi.org/10.18653/v1/2023.emnlp-main.155

Reimers, N., & Gurevych, I. (2019). Sentence-BERT: Sentence embeddings using Siamese BERT-networks. *EMNLP-IJCNLP 2019*. https://doi.org/10.18653/v1/D19-1410

Robertson, S., & Zaragoza, H. (2009). The probabilistic relevance framework: BM25 and beyond. *Foundations and Trends in Information Retrieval*. https://doi.org/10.1561/1500000019

Rudzicz, F., Wang, R., Begum, M., & Mihailidis, A. (2015). Speech interaction with personal assistive robots supporting aging at home for individuals with Alzheimer's disease. *ACM Transactions on Accessible Computing*. https://doi.org/10.1145/2744206

Sandhu, R. S., Coyne, E. J., Feinstein, H. L., & Youman, C. E. (1996). Role-based access control models. *IEEE Computer*. https://doi.org/10.1109/2.485845

Silva, A. R., Pinho, M. S., Macedo, L., & Moulin, C. J. A. (2016). A critical review of the effects of wearable cameras on memory. *Neuropsychological Rehabilitation*. https://doi.org/10.1080/09602011.2015.1128450

Singhal, K., Azizi, S., Tu, T., Mahdavi, S. S., Wei, J., et al. (2023). Large language models encode clinical knowledge. *Nature*. https://doi.org/10.1038/s41586-023-06291-2

Thorogood, A., Mäki-Petäjä-Leinonen, A., Brodaty, H., Dalpé, G., Gastmans, C., et al. (2018). Consent recommendations for research and international data sharing involving persons with dementia. *Alzheimer's & Dementia*. https://doi.org/10.1016/j.jalz.2018.05.011

Topol, E. J. (2019). High-performance medicine: The convergence of human and artificial intelligence. *Nature Medicine* (OpenAlex lists 2018). https://doi.org/10.1038/s41591-018-0300-7

Treder, M. S., Lee, S., & Tsvetanov, K. A. (2024). Introduction to large language models (LLMs) for dementia care and research. *Frontiers in Dementia*. https://doi.org/10.3389/frdem.2024.1385303

Wang, W., Wei, F., Dong, L., Bao, H., Yang, N., et al. (2020). MiniLM: Deep self-attention distillation for task-agnostic compression of pre-trained transformers. *arXiv / NeurIPS 2020*. https://doi.org/10.48550/arXiv.2002.10957

Wolters, M. K., Kelly, F., & Kilgour, J. (2015). Designing a spoken dialogue interface to an intelligent cognitive assistant for people with dementia. *Health Informatics Journal*. https://doi.org/10.1177/1460458215593329

Woods, B., O'Philbin, L., Farrell, E. M., Spector, A. E., & Orrell, M. (2018). Reminiscence therapy for dementia. *Cochrane Database of Systematic Reviews*. https://doi.org/10.1002/14651858.CD001120.pub3

Zhou, H., Zhu, Z., Oh, K. M., & Hong, S.-S. (2025). Empowering informal caregivers of persons with early-stage dementia by large language models: Mixed methods evaluation. *JMIR Formative Research*. https://doi.org/10.2196/79975

Zubatiy, T., Vickers, K. L., Mathur, N., & Mynatt, E. D. (2021). Empowering dyads of older adults with mild cognitive impairment and their care partners using conversational agents. *CHI 2021*. https://doi.org/10.1145/3411764.3445124

Zwijsen, S. A., Niemeijer, A. R., & Hertogh, C. M. P. M. (2011). Ethics of using assistive technology in the care for community-dwelling elderly people: An overview of the literature. *Aging & Mental Health*. https://doi.org/10.1080/13607863.2010.543662
