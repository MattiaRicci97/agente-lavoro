import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/lib/auth";
import { useCreateJoinRequest, useGetMe, getGetMeQueryKey } from "@sillabo/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Logo } from "@/components/Logo";
import { useToast } from "@/hooks/use-toast";
import { Clock, LogOut, CheckCircle2, XCircle, Loader2 } from "lucide-react";

const schema = z.object({
  joinCode: z.string().min(4, "Il codice classe non è valido"),
  studentName: z.string().min(1, "Il nome è obbligatorio"),
});

export default function JoinClass() {
  const { toast } = useToast();
  const { signOut, user } = useAuth();
  
  const queryClient = useQueryClient();
  const { data: me, refetch } = useGetMe();
  const createJoinRequest = useCreateJoinRequest();

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      joinCode: "",
      studentName: user?.fullName ?? "",
    },
  });

  function onSubmit(values: z.infer<typeof schema>) {
    createJoinRequest.mutate(
      { data: { joinCode: values.joinCode.trim().toUpperCase(), studentName: values.studentName } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
          refetch();
        },
        onError: (err: any) => {
          toast({
            title: "Errore",
            description: err?.response?.data?.error ?? "Codice classe non valido.",
            variant: "destructive",
          });
        },
      },
    );
  }

  const pendingRequest = me?.joinRequests.find((r) => r.status === "pending");
  const rejectedRequest = me?.joinRequests.find((r) => r.status === "rejected");

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full space-y-6">
        <div className="text-center space-y-2">
          <Logo className="text-secondary justify-center" size="lg" />
        </div>

        {pendingRequest ? (
          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center text-amber-600 mb-2">
                <Clock className="w-7 h-7" />
              </div>
              <CardTitle>Richiesta in attesa</CardTitle>
              <CardDescription>
                Il docente di <strong>{pendingRequest.className}</strong> deve ancora approvare la tua richiesta di iscrizione.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <Button variant="ghost" onClick={() => signOut({ redirectUrl: "/" })}>
                <LogOut className="mr-2 h-4 w-4" />
                Esci
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Entra in una classe</CardTitle>
              <CardDescription>Inserisci il codice fornito dal tuo docente per richiedere l'iscrizione.</CardDescription>
            </CardHeader>
            <CardContent>
              {rejectedRequest && (
                <div className="mb-4 flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-md p-3">
                  <XCircle className="h-4 w-4 shrink-0" />
                  La tua richiesta per <strong>{rejectedRequest.className}</strong> è stata rifiutata. Puoi provare con un altro codice.
                </div>
              )}
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="studentName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nome e cognome</FormLabel>
                        <FormControl>
                          <Input placeholder="es. Mario Rossi" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="joinCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Codice classe</FormLabel>
                        <FormControl>
                          <Input placeholder="es. AB12CD" className="uppercase tracking-widest" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" className="w-full" disabled={createJoinRequest.isPending}>
                    {createJoinRequest.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Invio richiesta...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Richiedi iscrizione
                      </>
                    )}
                  </Button>
                </form>
              </Form>
              <div className="text-center mt-4">
                <Button variant="ghost" size="sm" onClick={() => signOut({ redirectUrl: "/" })}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Esci
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
