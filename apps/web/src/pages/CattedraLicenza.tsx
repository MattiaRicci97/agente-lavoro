import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch, useListInstitutions } from "@sillabo/api-client-react";
import { TeacherLayout } from "@/components/TeacherLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Building2,
  KeyRound,
  UserPlus,
  ShieldCheck,
  Users,
  CalendarClock,
  Trash2,
  AlertTriangle,
} from "lucide-react";

type LicenseStatus = "prova" | "attiva" | "scaduta";

interface Member {
  id: number;
  teacherId: number;
  role: "amministratore" | "docente";
  createdAt: string;
  name: string;
  email: string;
}

interface LicenseResponse {
  institution: {
    id: number;
    name: string;
    city: string;
    plan: "prova" | "istituto";
    seats: number | null;
    licenseExpiresAt: string | null;
    licenseNotes: string | null;
  };
  status: LicenseStatus;
  seatsUsed: number;
  seatsAvailable: number | null;
  members: Member[];
  isAdmin: boolean;
}

const STATUS_LABEL: Record<LicenseStatus, string> = {
  prova: "In prova",
  attiva: "Licenza attiva",
  scaduta: "Licenza scaduta",
};

function StatusBadge({ status }: { status: LicenseStatus }) {
  const tone =
    status === "attiva"
      ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
      : status === "scaduta"
        ? "bg-destructive/10 text-destructive hover:bg-destructive/10"
        : "bg-amber-100 text-amber-800 hover:bg-amber-100";
  return <Badge className={tone}>{STATUS_LABEL[status]}</Badge>;
}

function formatDate(iso: string | null) {
  if (!iso) return "senza scadenza";
  return new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
}

/** Riquadro licenza: piano, posti occupati e scadenza. */
function LicenseCard({
  data,
  onSave,
  isSaving,
}: {
  data: LicenseResponse;
  onSave: (payload: { plan: string; seats: number | null; licenseExpiresAt: string | null }) => void;
  isSaving: boolean;
}) {
  const { institution, status, seatsUsed } = data;
  const [editing, setEditing] = useState(false);
  const [plan, setPlan] = useState(institution.plan);
  const [seats, setSeats] = useState(institution.seats !== null ? String(institution.seats) : "");
  const [expires, setExpires] = useState(
    institution.licenseExpiresAt ? institution.licenseExpiresAt.slice(0, 10) : "",
  );

  const seatPercent =
    institution.seats && institution.seats > 0 ? Math.min(100, (seatsUsed / institution.seats) * 100) : 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-[18px] w-[18px] text-secondary" />
            Licenza
          </CardTitle>
          <CardDescription>
            {institution.name} — {institution.city}
          </CardDescription>
        </div>
        <StatusBadge status={status} />
      </CardHeader>

      <CardContent className="space-y-5">
        {status === "scaduta" && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              La licenza è scaduta il {formatDate(institution.licenseExpiresAt)}: non è possibile attivare
              nuovi docenti finché non viene rinnovata.
            </span>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Piano</div>
            <div className="mt-1 font-medium">
              {institution.plan === "istituto" ? "Istituto" : "Prova gratuita"}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Posti docente</div>
            <div className="mt-1 font-medium">
              {institution.seats === null ? `${seatsUsed} attivi · illimitati` : `${seatsUsed} / ${institution.seats}`}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Scadenza</div>
            <div className="mt-1 flex items-center gap-1.5 font-medium">
              <CalendarClock className="h-4 w-4 text-muted-foreground" />
              {formatDate(institution.licenseExpiresAt)}
            </div>
          </div>
        </div>

        {institution.seats !== null && <Progress value={seatPercent} className="h-2" />}

        {institution.licenseNotes && (
          <p className="text-sm text-muted-foreground">Riferimento: {institution.licenseNotes}</p>
        )}

        {data.isAdmin &&
          (editing ? (
            <div className="space-y-4 rounded-lg border bg-muted/20 p-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Piano</Label>
                  <Select value={plan} onValueChange={(v) => setPlan(v as "prova" | "istituto")}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="prova">Prova gratuita</SelectItem>
                      <SelectItem value="istituto">Istituto</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Posti (vuoto = illimitati)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={seats}
                    onChange={(e) => setSeats(e.target.value)}
                    placeholder="∞"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Scadenza</Label>
                  <Input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setEditing(false)}>
                  Annulla
                </Button>
                <Button
                  disabled={isSaving}
                  onClick={() =>
                    onSave({
                      plan,
                      seats: seats.trim() === "" ? null : Number(seats),
                      licenseExpiresAt: expires ? new Date(`${expires}T23:59:59`).toISOString() : null,
                    })
                  }
                >
                  Salva licenza
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" onClick={() => setEditing(true)}>
              Modifica licenza
            </Button>
          ))}
      </CardContent>
    </Card>
  );
}

export default function CattedraLicenza() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: institutions, isLoading: institutionsLoading } = useListInstitutions();
  const institutionId = institutions?.[0]?.id;

  const [email, setEmail] = useState("");
  const [newRole, setNewRole] = useState<"amministratore" | "docente">("docente");
  const [toRemove, setToRemove] = useState<Member | null>(null);

  const queryKey = ["institutionLicense", institutionId];
  const { data, isLoading } = useQuery({
    queryKey,
    enabled: !!institutionId,
    queryFn: () => customFetch<LicenseResponse>(`/api/institutions/${institutionId}/license`, { responseType: "json" }),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey });
  const fail = (fallback: string) => (err: any) =>
    toast({ title: "Operazione non riuscita", description: err?.data?.error ?? fallback, variant: "destructive" });

  const claim = useMutation({
    mutationFn: () =>
      customFetch(`/api/institutions/${institutionId}/claim`, { method: "POST", responseType: "json" }),
    onSuccess: () => {
      toast({ title: "Istituto rivendicato", description: "Ora sei amministratore di questo istituto." });
      refresh();
    },
    onError: fail("Impossibile rivendicare l'istituto."),
  });

  const addMember = useMutation({
    mutationFn: () =>
      customFetch(`/api/institutions/${institutionId}/members`, {
        method: "POST",
        responseType: "json",
        body: JSON.stringify({ email: email.trim(), role: newRole }),
      }),
    onSuccess: () => {
      toast({ title: "Utenza attivata", description: `${email.trim()} può ora usare Sillabo per l'istituto.` });
      setEmail("");
      setNewRole("docente");
      refresh();
    },
    onError: fail("Impossibile attivare questo docente."),
  });

  const changeRole = useMutation({
    mutationFn: ({ memberId, role }: { memberId: number; role: Member["role"] }) =>
      customFetch(`/api/institutions/${institutionId}/members/${memberId}`, {
        method: "PATCH",
        responseType: "json",
        body: JSON.stringify({ role }),
      }),
    onSuccess: () => refresh(),
    onError: fail("Impossibile cambiare il ruolo."),
  });

  const removeMember = useMutation({
    mutationFn: (memberId: number) =>
      customFetch(`/api/institutions/${institutionId}/members/${memberId}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Utenza disattivata", description: "Il posto è di nuovo disponibile." });
      setToRemove(null);
      refresh();
    },
    onError: fail("Impossibile disattivare questo docente."),
  });

  const saveLicense = useMutation({
    mutationFn: (payload: { plan: string; seats: number | null; licenseExpiresAt: string | null }) =>
      customFetch(`/api/institutions/${institutionId}/license`, {
        method: "PATCH",
        responseType: "json",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast({ title: "Licenza aggiornata" });
      refresh();
    },
    onError: fail("Impossibile aggiornare la licenza."),
  });

  if (institutionsLoading || (institutionId && isLoading)) {
    return (
      <TeacherLayout>
        <div className="mx-auto max-w-4xl space-y-6 p-8">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </TeacherLayout>
    );
  }

  if (!institutionId || !data) {
    return (
      <TeacherLayout>
        <div className="mx-auto max-w-4xl p-8">
          <div className="rounded-lg border border-dashed bg-card p-12 text-center">
            <Building2 className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" />
            <h3 className="text-lg font-medium">Nessun istituto configurato</h3>
            <p className="text-muted-foreground">Crea prima un istituto dalla sezione Istituto.</p>
          </div>
        </div>
      </TeacherLayout>
    );
  }

  const unclaimed = data.members.length === 0;
  const seatsFull = data.seatsAvailable !== null && data.seatsAvailable <= 0;
  const canAdd = data.isAdmin && data.status !== "scaduta" && !seatsFull;

  return (
    <TeacherLayout>
      <div className="mx-auto max-w-4xl space-y-6 p-8">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-primary">Licenza e utenze</h1>
          <p className="mt-1 text-muted-foreground">
            L'istituto acquista un numero di posti: l'amministratore decide quali docenti li occupano.
          </p>
        </div>

        {unclaimed && (
          <Card className="border-secondary/30 bg-secondary/5">
            <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="font-medium">Questo istituto non ha ancora un amministratore</div>
                <p className="text-sm text-muted-foreground">
                  È stato creato prima dell'introduzione delle licenze. Rivendicalo per poter gestire posti e utenze.
                </p>
              </div>
              <Button onClick={() => claim.mutate()} disabled={claim.isPending} className="shrink-0">
                <ShieldCheck className="mr-2 h-4 w-4" />
                Diventa amministratore
              </Button>
            </CardContent>
          </Card>
        )}

        <LicenseCard data={data} onSave={(p) => saveLicense.mutate(p)} isSaving={saveLicense.isPending} />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-[18px] w-[18px] text-secondary" />
              Docenti attivi
            </CardTitle>
            <CardDescription>
              {data.seatsAvailable === null
                ? `${data.seatsUsed} docenti attivi, posti illimitati.`
                : `${data.seatsUsed} docenti attivi su ${data.institution.seats} posti — ${data.seatsAvailable} liberi.`}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-5">
            {data.isAdmin && (
              <form
                className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-4 sm:flex-row sm:items-end"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (email.trim()) addMember.mutate();
                }}
              >
                <div className="flex-1 space-y-1.5">
                  <Label className="text-xs">Email del docente</Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nome.cognome@scuola.it"
                    className="bg-card"
                  />
                </div>
                <div className="w-full space-y-1.5 sm:w-44">
                  <Label className="text-xs">Ruolo</Label>
                  <Select value={newRole} onValueChange={(v) => setNewRole(v as Member["role"])}>
                    <SelectTrigger className="bg-card">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="docente">Docente</SelectItem>
                      <SelectItem value="amministratore">Amministratore</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" disabled={!canAdd || addMember.isPending || !email.trim()}>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Attiva
                </Button>
              </form>
            )}

            {data.isAdmin && seatsFull && (
              <p className="text-sm text-destructive">
                Tutti i posti della licenza sono occupati: disattiva un docente o richiedi più posti.
              </p>
            )}

            {!data.isAdmin && !unclaimed && (
              <p className="text-sm text-muted-foreground">
                Solo un amministratore dell'istituto può attivare o disattivare le utenze.
              </p>
            )}

            <div className="divide-y rounded-lg border">
              {data.members.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  Nessun docente attivo su questa licenza.
                </div>
              ) : (
                data.members.map((m) => (
                  <div key={m.id} className="flex flex-wrap items-center gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 font-medium">
                        {m.name}
                        {m.role === "amministratore" && (
                          <Badge variant="outline" className="gap-1 text-[10px]">
                            <ShieldCheck className="h-3 w-3" />
                            Amministratore
                          </Badge>
                        )}
                      </div>
                      <div className="truncate text-sm text-muted-foreground">{m.email}</div>
                    </div>

                    {data.isAdmin && (
                      <>
                        <Select
                          value={m.role}
                          onValueChange={(v) => changeRole.mutate({ memberId: m.id, role: v as Member["role"] })}
                        >
                          <SelectTrigger className="w-44">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="docente">Docente</SelectItem>
                            <SelectItem value="amministratore">Amministratore</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => setToRemove(m)}
                          aria-label={`Disattiva ${m.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={!!toRemove} onOpenChange={(open) => !open && setToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disattivare {toRemove?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Perde l'accesso a Sillabo per conto dell'istituto e il posto torna disponibile. Le classi e i
              materiali che ha creato restano.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => toRemove && removeMember.mutate(toRemove.id)}
              disabled={removeMember.isPending}
            >
              Disattiva
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TeacherLayout>
  );
}
