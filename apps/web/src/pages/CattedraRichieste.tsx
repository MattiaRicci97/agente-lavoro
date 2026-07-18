import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  useListJoinRequests,
  useApproveJoinRequest,
  useRejectJoinRequest,
  useListClasses,
  useListInstitutions,
  useCreateClass,
  getListClassesQueryKey,
  getGetDashboardSummaryQueryKey,
  getListStudentsQueryKey,
} from "@sillabo/api-client-react";
import { getListJoinRequestsQueryKey } from "@sillabo/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { TeacherLayout } from "@/components/TeacherLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Check, X, Inbox, KeyRound, Copy, Plus, Loader2 } from "lucide-react";

const createClassSchema = z.object({
  name: z.string().min(1, "Il nome della classe è obbligatorio"),
  gradeLevel: z.string().min(1, "Il livello scolastico è obbligatorio"),
  institutionId: z.string().min(1, "Seleziona un istituto"),
});

export default function CattedraRichieste() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const { data: requests, isLoading } = useListJoinRequests();
  const { data: classes, isLoading: classesLoading } = useListClasses();
  const { data: institutions } = useListInstitutions();
  const approve = useApproveJoinRequest();
  const reject = useRejectJoinRequest();
  const createClass = useCreateClass();

  const createForm = useForm<z.infer<typeof createClassSchema>>({
    resolver: zodResolver(createClassSchema),
    defaultValues: { name: "", gradeLevel: "", institutionId: "" },
  });

  function onCreateSubmit(values: z.infer<typeof createClassSchema>) {
    createClass.mutate(
      {
        data: {
          name: values.name,
          gradeLevel: values.gradeLevel,
          institutionId: Number(values.institutionId),
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListClassesQueryKey() });
          toast({ title: "Classe creata", description: `Codice: ${values.name}` });
          createForm.reset();
          setCreateOpen(false);
        },
        onError: (err: any) => {
          toast({
            title: "Errore",
            description: err?.response?.data?.error ?? "Impossibile creare la classe.",
            variant: "destructive",
          });
        },
      },
    );
  }

  function invalidateAfterDecision() {
    queryClient.invalidateQueries({ queryKey: getListJoinRequestsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
    classes?.forEach((c) => {
      queryClient.invalidateQueries({ queryKey: getListStudentsQueryKey(c.id) });
    });
  }

  function handleApprove(id: number) {
    approve.mutate(
      { id },
      {
        onSuccess: invalidateAfterDecision,
        onError: (err: any) => {
          toast({
            title: "Errore",
            description: err?.response?.data?.error ?? "Impossibile approvare la richiesta.",
            variant: "destructive",
          });
        },
      },
    );
  }

  function handleReject(id: number) {
    reject.mutate(
      { id },
      {
        onSuccess: invalidateAfterDecision,
        onError: (err: any) => {
          toast({
            title: "Errore",
            description: err?.response?.data?.error ?? "Impossibile rifiutare la richiesta.",
            variant: "destructive",
          });
        },
      },
    );
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code);
    toast({ title: "Codice copiato", description: code });
  }

  const pendingRequests = requests?.filter((r) => r.status === "pending") ?? [];
  const decidedRequests = requests?.filter((r) => r.status !== "pending") ?? [];

  return (
    <TeacherLayout>
      <div className="p-8 max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Richieste di iscrizione</h1>
          <p className="text-muted-foreground mt-1">Approva o rifiuta le richieste degli studenti per entrare nelle tue classi.</p>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <KeyRound className="h-4 w-4" />
                Codici classe
              </CardTitle>
              <CardDescription>Condividi questi codici con i tuoi studenti per farli iscrivere.</CardDescription>
            </div>
            <Dialog
              open={createOpen}
              onOpenChange={(open) => {
                setCreateOpen(open);
                if (open && institutions?.length === 1) {
                  createForm.setValue("institutionId", String(institutions[0].id));
                }
              }}
            >
              <DialogTrigger asChild>
                <Button size="sm" variant="outline">
                  <Plus className="mr-1.5 h-4 w-4" />
                  Nuova classe
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Crea una nuova classe</DialogTitle>
                  <DialogDescription>
                    Ti verrà assegnato un codice univoco da condividere con i tuoi studenti.
                  </DialogDescription>
                </DialogHeader>
                <Form {...createForm}>
                  <form onSubmit={createForm.handleSubmit(onCreateSubmit)} className="space-y-4">
                    <FormField
                      control={createForm.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nome classe</FormLabel>
                          <FormControl>
                            <Input placeholder="es. 2B" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={createForm.control}
                      name="gradeLevel"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Livello scolastico</FormLabel>
                          <FormControl>
                            <Input placeholder="es. Seconda superiore" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    {institutions && institutions.length > 1 && (
                      <FormField
                        control={createForm.control}
                        name="institutionId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Istituto</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Seleziona un istituto" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {institutions.map((inst) => (
                                  <SelectItem key={inst.id} value={String(inst.id)}>
                                    {inst.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                    <Button type="submit" className="w-full" disabled={createClass.isPending}>
                      {createClass.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Creazione in corso...
                        </>
                      ) : (
                        "Crea classe"
                      )}
                    </Button>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            {classesLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : !classes?.length ? (
              <p className="text-sm text-muted-foreground">Nessuna classe disponibile.</p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {classes.map((c) => (
                  <div key={c.id} className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <div className="font-medium text-sm">{c.name} — {c.gradeLevel}</div>
                      <div className="text-lg font-mono tracking-widest font-semibold">{c.joinCode}</div>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => copyCode(c.joinCode)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <h2 className="text-xl font-semibold tracking-tight">In attesa</h2>
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : pendingRequests.length === 0 ? (
            <div className="text-center p-12 border rounded-lg bg-card border-dashed">
              <Inbox className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium">Nessuna richiesta in attesa</h3>
              <p className="text-muted-foreground">Le nuove richieste di iscrizione appariranno qui.</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {pendingRequests.map((r) => (
                <Card key={r.id}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <div className="font-semibold">{r.studentName}</div>
                      <div className="text-sm text-muted-foreground">Vuole entrare in {r.className}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => handleReject(r.id)} disabled={reject.isPending || approve.isPending}>
                        <X className="mr-1.5 h-4 w-4" />
                        Rifiuta
                      </Button>
                      <Button size="sm" onClick={() => handleApprove(r.id)} disabled={reject.isPending || approve.isPending}>
                        <Check className="mr-1.5 h-4 w-4" />
                        Approva
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {decidedRequests.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold tracking-tight">Storico</h2>
            <div className="grid gap-2">
              {decidedRequests.map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded-md border p-3 text-sm">
                  <div>
                    <span className="font-medium">{r.studentName}</span>
                    <span className="text-muted-foreground"> — {r.className}</span>
                  </div>
                  <Badge variant={r.status === "approved" ? "secondary" : "outline"}>
                    {r.status === "approved" ? "Approvata" : "Rifiutata"}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </TeacherLayout>
  );
}
